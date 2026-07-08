package rulesource

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"sentinelflow/engine/internal/evaluator"
)

type SupabaseSource struct {
	httpClient *http.Client
	secretKey  string
	symbols    []string
	url        string
}

type supabaseAlertRuleRow struct {
	ID           string `json:"id"`
	MarketSymbol string `json:"market_symbol"`
	Name         string `json:"name"`
	Params       struct {
		ConfirmationRows    int     `json:"confirmationRows"`
		ThresholdMultiplier float64 `json:"thresholdMultiplier"`
		MinAbsorptionVolume float64 `json:"minAbsorptionVolume"`
		TrapSide            string  `json:"trapSide"`
	} `json:"params"`
	RuleType  string `json:"rule_type"`
	Status    string `json:"status"`
	Timeframe string `json:"timeframe"`
	UserID    string `json:"user_id"`
}

func NewSupabaseSource(projectURL string, secretKey string, symbols []string) *SupabaseSource {
	return &SupabaseSource{
		httpClient: &http.Client{Timeout: 10 * time.Second},
		secretKey:  strings.TrimSpace(secretKey),
		symbols:    append([]string(nil), symbols...),
		url:        strings.TrimRight(strings.TrimSpace(projectURL), "/"),
	}
}

func (s *SupabaseSource) Load(ctx context.Context) ([]evaluator.Rule, error) {
	endpoint, err := url.Parse(s.url + "/rest/v1/alert_rules")
	if err != nil {
		return nil, fmt.Errorf("build supabase alert_rules endpoint: %w", err)
	}

	query := endpoint.Query()
	query.Set("select", "id,user_id,name,market_symbol,timeframe,rule_type,status,params")
	query.Set("status", "eq.active")
	query.Set("rule_type", "in.(stacked_imbalance,trapped_traders)")
	if len(s.symbols) > 0 {
		query.Set("market_symbol", "in.("+strings.Join(s.symbols, ",")+")")
	}
	endpoint.RawQuery = query.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("create supabase rules request: %w", err)
	}

	request.Header.Set("apikey", s.secretKey)
	request.Header.Set("Authorization", "Bearer "+s.secretKey)
	request.Header.Set("Accept", "application/json")

	response, err := s.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request supabase rules: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("supabase rules request failed with status %d", response.StatusCode)
	}

	var rows []supabaseAlertRuleRow
	if err := json.NewDecoder(response.Body).Decode(&rows); err != nil {
		return nil, fmt.Errorf("decode supabase rules response: %w", err)
	}

	rules := make([]evaluator.Rule, 0, len(rows))
	for _, row := range rows {
		if row.ID == "" || row.UserID == "" || row.Name == "" || row.MarketSymbol == "" || row.Timeframe == "" {
			continue
		}

		switch row.RuleType {
		case "stacked_imbalance":
			if row.Params.ConfirmationRows <= 0 || row.Params.ThresholdMultiplier <= 0 {
				continue
			}

			rules = append(rules, evaluator.Rule{
				ID:           row.ID,
				MarketSymbol: row.MarketSymbol,
				Name:         row.Name,
				RuleType:     row.RuleType,
				Status:       row.Status,
				Timeframe:    row.Timeframe,
				UserID:       row.UserID,
				StackedImbalance: &evaluator.StackedImbalanceParams{
					ConfirmationRows:    row.Params.ConfirmationRows,
					ThresholdMultiplier: row.Params.ThresholdMultiplier,
				},
			})
		case "trapped_traders":
			if row.Params.MinAbsorptionVolume <= 0 {
				continue
			}

			trapSide := row.Params.TrapSide
			if trapSide != "buyers" && trapSide != "sellers" && trapSide != "both" {
				continue
			}

			rules = append(rules, evaluator.Rule{
				ID:           row.ID,
				MarketSymbol: row.MarketSymbol,
				Name:         row.Name,
				RuleType:     row.RuleType,
				Status:       row.Status,
				Timeframe:    row.Timeframe,
				UserID:       row.UserID,
				TrappedTraders: &evaluator.TrappedTradersParams{
					MinAbsorptionVolume: row.Params.MinAbsorptionVolume,
					TrapSide:            trapSide,
				},
			})
		default:
			continue
		}
	}

	return rules, nil
}

func (s *SupabaseSource) Name() string {
	return "supabase-alert-rules"
}
