package alertstore

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"sentinelflow/engine/internal/alerts"
	"sentinelflow/engine/internal/klines"
	"sentinelflow/engine/internal/marketstate"
	"sentinelflow/engine/internal/outcome"
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
	RuleType              string  `json:"rule_type"`
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

type supabasePendingOutcomeRow struct {
	ID                   string  `json:"id"`
	MarketSymbol         string  `json:"market_symbol"`
	Side                 string  `json:"side"`
	Timeframe            string  `json:"timeframe"`
	CreatedAt            string  `json:"created_at"`
	TradePlanEntryPrice  float64 `json:"trade_plan_entry_price"`
	TradePlanStopLoss    float64 `json:"trade_plan_stop_loss"`
	TradePlanTakeProfit1 float64 `json:"trade_plan_take_profit_1"`
	TradePlanTakeProfit2 float64 `json:"trade_plan_take_profit_2"`
}

// PendingOutcomeAlerts returns delivered alerts that are still waiting for
// a real tracked outcome (outcome_status = 'pending'), oldest first, that
// are at least minAge old so at least one candle has had a chance to close.
func (s *SupabaseStore) PendingOutcomeAlerts(ctx context.Context, minAge time.Duration, limit int) ([]outcome.PendingAlert, error) {
	if !s.IsConfigured() {
		return nil, fmt.Errorf("supabase alert store is not configured")
	}

	endpoint, err := url.Parse(s.url + "/rest/v1/alert_history")
	if err != nil {
		return nil, fmt.Errorf("build supabase alert_history endpoint: %w", err)
	}

	cutoff := time.Now().UTC().Add(-minAge)

	query := endpoint.Query()
	query.Set("select", "id,market_symbol,side,timeframe,created_at,trade_plan_entry_price,trade_plan_stop_loss,trade_plan_take_profit_1,trade_plan_take_profit_2")
	query.Set("outcome_status", "eq.pending")
	query.Set("created_at", "lte."+cutoff.Format(time.RFC3339))
	query.Set("order", "created_at.asc")
	query.Set("limit", strconv.Itoa(limit))
	endpoint.RawQuery = query.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("create pending outcome request: %w", err)
	}

	request.Header.Set("Accept", "application/json")
	request.Header.Set("apikey", s.secretKey)
	request.Header.Set("Authorization", "Bearer "+s.secretKey)

	response, err := s.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request pending outcome alerts: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("pending outcome alerts request failed with status %d", response.StatusCode)
	}

	var rows []supabasePendingOutcomeRow
	if err := json.NewDecoder(response.Body).Decode(&rows); err != nil {
		return nil, fmt.Errorf("decode pending outcome alerts: %w", err)
	}

	alertsPending := make([]outcome.PendingAlert, 0, len(rows))
	for _, row := range rows {
		createdAt, err := time.Parse(time.RFC3339, row.CreatedAt)
		if err != nil {
			continue
		}

		alertsPending = append(alertsPending, outcome.PendingAlert{
			ID:           row.ID,
			MarketSymbol: row.MarketSymbol,
			Side:         row.Side,
			Timeframe:    row.Timeframe,
			CreatedAt:    createdAt.UTC(),
			EntryPrice:   row.TradePlanEntryPrice,
			StopLoss:     row.TradePlanStopLoss,
			TakeProfit1:  row.TradePlanTakeProfit1,
			TakeProfit2:  row.TradePlanTakeProfit2,
		})
	}

	return alertsPending, nil
}

// UpdateOutcome persists a resolved (or expired) real outcome for one
// alert.
func (s *SupabaseStore) UpdateOutcome(ctx context.Context, result outcome.Result) error {
	if !s.IsConfigured() {
		return fmt.Errorf("supabase alert store is not configured")
	}

	if result.AlertID == "" {
		return fmt.Errorf("outcome result is missing an alert id")
	}

	endpoint, err := url.Parse(s.url + "/rest/v1/alert_history")
	if err != nil {
		return fmt.Errorf("build supabase alert_history endpoint: %w", err)
	}

	query := endpoint.Query()
	query.Set("id", "eq."+result.AlertID)
	endpoint.RawQuery = query.Encode()

	payload := map[string]any{
		"outcome_status":     string(result.Status),
		"outcome_checked_at": time.Now().UTC().Format(time.RFC3339),
	}

	if result.Status == outcome.StatusTP1Hit || result.Status == outcome.StatusTP2Hit || result.Status == outcome.StatusStopHit {
		payload["outcome_hit_price"] = result.HitPrice
		payload["outcome_hit_at"] = result.HitAt.UTC().Format(time.RFC3339)
		payload["outcome_r_multiple"] = result.RMultiple
	}

	if result.Note != "" {
		payload["outcome_note"] = result.Note
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode outcome update: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPatch, endpoint.String(), bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create outcome update request: %w", err)
	}

	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("apikey", s.secretKey)
	request.Header.Set("Authorization", "Bearer "+s.secretKey)
	request.Header.Set("Prefer", "return=minimal")

	response, err := s.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("request outcome update: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("outcome update failed with status %d", response.StatusCode)
	}

	return nil
}

type supabaseCandleRow struct {
	MarketSymbol string  `json:"market_symbol"`
	Timeframe    string  `json:"timeframe"`
	BucketStart  string  `json:"bucket_start"`
	Open         float64 `json:"open"`
	High         float64 `json:"high"`
	Low          float64 `json:"low"`
	Close        float64 `json:"close"`
	BuyVolume    float64 `json:"buy_volume"`
	SellVolume   float64 `json:"sell_volume"`
	TotalVolume  float64 `json:"total_volume"`
	Trades       int64   `json:"trades"`
}

// UpsertCandle persists one real, closed candle observed directly from the
// live Bybit trade feed. Called once per candle close (never for the
// in-progress current candle), so every row here is a genuinely finished,
// fully-observed candle - never an estimate.
func (s *SupabaseStore) UpsertCandle(ctx context.Context, candle marketstate.Candle) error {
	if !s.IsConfigured() {
		return fmt.Errorf("supabase alert store is not configured")
	}

	endpoint, err := url.Parse(s.url + "/rest/v1/candle_history")
	if err != nil {
		return fmt.Errorf("build supabase candle_history endpoint: %w", err)
	}

	query := endpoint.Query()
	query.Set("on_conflict", "market_symbol,timeframe,bucket_start")
	endpoint.RawQuery = query.Encode()

	row := supabaseCandleRow{
		MarketSymbol: candle.Symbol,
		Timeframe:    candle.Timeframe,
		BucketStart:  candle.BucketStart.UTC().Format(time.RFC3339),
		Open:         candle.Open,
		High:         candle.High,
		Low:          candle.Low,
		Close:        candle.Close,
		BuyVolume:    candle.BuyVolume,
		SellVolume:   candle.SellVolume,
		TotalVolume:  candle.TotalVolume,
		Trades:       candle.Trades,
	}

	payload, err := json.Marshal(row)
	if err != nil {
		return fmt.Errorf("encode candle history row: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create candle history request: %w", err)
	}

	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("apikey", s.secretKey)
	request.Header.Set("Authorization", "Bearer "+s.secretKey)
	request.Header.Set("Prefer", "resolution=merge-duplicates,return=minimal")

	response, err := s.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("request candle history upsert: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("candle history upsert failed with status %d", response.StatusCode)
	}

	return nil
}

// FetchKlines satisfies outcome.KlineFetcher using our own recorded
// candle_history table instead of Bybit's REST API, which is blocked
// (HTTP 403) for every published Bybit domain from Railway's egress IP.
// It only ever returns candles that were genuinely observed live via the
// WebSocket feed - if none were recorded for the requested window (for
// example, an alert created before this table existed), it returns an
// empty slice rather than fabricating anything.
func (s *SupabaseStore) FetchKlines(ctx context.Context, symbol string, intervalMinutes int, start time.Time, end time.Time) ([]klines.Kline, error) {
	if !s.IsConfigured() {
		return nil, fmt.Errorf("supabase alert store is not configured")
	}

	timeframe, ok := timeframeLabel(intervalMinutes)
	if !ok {
		return nil, fmt.Errorf("unsupported kline interval %d minutes", intervalMinutes)
	}

	endpoint, err := url.Parse(s.url + "/rest/v1/candle_history")
	if err != nil {
		return nil, fmt.Errorf("build supabase candle_history endpoint: %w", err)
	}

	query := endpoint.Query()
	query.Set("select", "bucket_start,open,high,low,close")
	query.Set("market_symbol", "eq."+symbol)
	query.Set("timeframe", "eq."+timeframe)
	query.Add("bucket_start", "gte."+start.UTC().Format(time.RFC3339))
	query.Add("bucket_start", "lte."+end.UTC().Format(time.RFC3339))
	query.Set("order", "bucket_start.asc")
	query.Set("limit", "2000")
	endpoint.RawQuery = query.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("create candle history request: %w", err)
	}

	request.Header.Set("Accept", "application/json")
	request.Header.Set("apikey", s.secretKey)
	request.Header.Set("Authorization", "Bearer "+s.secretKey)

	response, err := s.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request candle history: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("candle history request failed with status %d", response.StatusCode)
	}

	var rows []supabaseCandleRow
	if err := json.NewDecoder(response.Body).Decode(&rows); err != nil {
		return nil, fmt.Errorf("decode candle history: %w", err)
	}

	out := make([]klines.Kline, 0, len(rows))
	for _, row := range rows {
		bucketStart, err := time.Parse(time.RFC3339, row.BucketStart)
		if err != nil {
			continue
		}

		out = append(out, klines.Kline{
			StartTime: bucketStart.UTC(),
			Open:      row.Open,
			High:      row.High,
			Low:       row.Low,
			Close:     row.Close,
		})
	}

	return out, nil
}

func timeframeLabel(intervalMinutes int) (string, bool) {
	switch intervalMinutes {
	case 1:
		return "1m", true
	case 5:
		return "5m", true
	case 15:
		return "15m", true
	default:
		return "", false
	}
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
		RuleType:              record.RuleType,
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
