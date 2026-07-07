package alertstore

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"sentinelflow/engine/internal/alerts"
)

type SupabaseStore struct {
	httpClient *http.Client
	secretKey  string
	url        string
}

type supabaseAlertHistoryRow struct {
	CreatedAt             string  `json:"created_at"`
	DeliveryStatus        string  `json:"delivery_status"`
	ID                    string  `json:"id"`
	MarketSymbol          string  `json:"market_symbol"`
	Message               string  `json:"message"`
	ProofContent          string  `json:"proof_content"`
	ProofHash             string  `json:"proof_content_hash"`
	ProofHeight           int     `json:"proof_height"`
	ProofMediaType        string  `json:"proof_media_type"`
	ProofWidth            int     `json:"proof_width"`
	RuleName              string  `json:"rule_name"`
	Side                  string  `json:"side"`
	Timeframe             string  `json:"timeframe"`
	TradePlanEntryPrice   float64 `json:"trade_plan_entry_price"`
	TradePlanRiskReward1  float64 `json:"trade_plan_risk_reward_1"`
	TradePlanRiskReward2  float64 `json:"trade_plan_risk_reward_2"`
	TradePlanSignalHigh   float64 `json:"trade_plan_signal_high"`
	TradePlanSignalLow    float64 `json:"trade_plan_signal_low"`
	TradePlanStopLoss     float64 `json:"trade_plan_stop_loss"`
	TradePlanTakeProfit1  float64 `json:"trade_plan_take_profit_1"`
	TradePlanTakeProfit2  float64 `json:"trade_plan_take_profit_2"`
	TradePlanTriggerPrice float64 `json:"trade_plan_trigger_price"`
	UpdatedAt             string  `json:"updated_at"`
	UserID                string  `json:"user_id"`
}

func NewSupabaseStore(projectURL string, secretKey string) *SupabaseStore {
	return &SupabaseStore{
		httpClient: &http.Client{Timeout: 10 * time.Second},
		secretKey:  strings.TrimSpace(secretKey),
		url:        strings.TrimRight(strings.TrimSpace(projectURL), "/"),
	}
}

func (s *SupabaseStore) IsConfigured() bool {
	return s.url != "" && s.secretKey != ""
}

func (s *SupabaseStore) Upsert(ctx context.Context, record alerts.Record) error {
	if !s.IsConfigured() {
		return fmt.Errorf("supabase alert store is not configured")
	}

	endpoint, err := url.Parse(s.url + "/rest/v1/alert_history")
	if err != nil {
		return fmt.Errorf("build supabase alert_history endpoint: %w", err)
	}

	query := endpoint.Query()
	query.Set("on_conflict", "id")
	endpoint.RawQuery = query.Encode()

	payload, err := json.Marshal(mapAlertHistoryRow(record))
	if err != nil {
		return fmt.Errorf("encode alert history row: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create alert history request: %w", err)
	}

	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("apikey", s.secretKey)
	request.Header.Set("Authorization", "Bearer "+s.secretKey)
	request.Header.Set("Prefer", "resolution=merge-duplicates,return=minimal")

	response, err := s.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("request alert history upsert: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("alert history upsert failed with status %d", response.StatusCode)
	}

	return nil
}

func mapAlertHistoryRow(record alerts.Record) supabaseAlertHistoryRow {
	createdAt := record.CreatedAt.UTC()
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}

	now := time.Now().UTC()

	return supabaseAlertHistoryRow{
		CreatedAt:             createdAt.Format(time.RFC3339),
		DeliveryStatus:        string(record.DeliveryStatus),
		ID:                    record.ID,
		MarketSymbol:          record.MarketSymbol,
		Message:               record.Message,
		ProofContent:          record.Proof.Content,
		ProofHash:             record.Proof.ContentHash,
		ProofHeight:           record.Proof.Height,
		ProofMediaType:        record.Proof.MediaType,
		ProofWidth:            record.Proof.Width,
		RuleName:              record.RuleName,
		Side:                  record.Side,
		Timeframe:             record.Timeframe,
		TradePlanEntryPrice:   record.TradePlan.EntryPrice,
		TradePlanRiskReward1:  record.TradePlan.RiskReward1,
		TradePlanRiskReward2:  record.TradePlan.RiskReward2,
		TradePlanSignalHigh:   record.TradePlan.SignalHigh,
		TradePlanSignalLow:    record.TradePlan.SignalLow,
		TradePlanStopLoss:     record.TradePlan.StopLoss,
		TradePlanTakeProfit1:  record.TradePlan.TakeProfit1,
		TradePlanTakeProfit2:  record.TradePlan.TakeProfit2,
		TradePlanTriggerPrice: record.TradePlan.TriggerPrice,
		UpdatedAt:             now.Format(time.RFC3339),
		UserID:                record.UserID,
	}
}
