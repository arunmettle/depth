package backtest

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// SupabaseWriter persists a completed backtest run's headline summary to
// Supabase's public.backtest_runs table, so a real (not fabricated)
// historical track record can be shown to first-time visitors before they
// have any live alert history of their own - the "cold-start trust"
// problem. Uses the engine's own SUPABASE_URL/SUPABASE_SECRET_KEY, the
// same credentials and REST convention engine/internal/alertstore already
// uses, so no new configuration is needed to run this from the same
// environment as the live engine.
type SupabaseWriter struct {
	httpClient *http.Client
	secretKey  string
	url        string
}

func NewSupabaseWriter(projectURL string, secretKey string) *SupabaseWriter {
	return &SupabaseWriter{
		httpClient: &http.Client{Timeout: 15 * time.Second},
		secretKey:  strings.TrimSpace(secretKey),
		url:        strings.TrimRight(strings.TrimSpace(projectURL), "/"),
	}
}

func (w *SupabaseWriter) IsConfigured() bool {
	return w.url != "" && w.secretKey != ""
}

// Run describes the parameters and window a Summary was computed over -
// everything a reader needs to understand what a summary row represents.
type Run struct {
	Symbol              string
	RuleType            string
	Timeframe           string
	Params              map[string]any
	PeriodStart         time.Time
	PeriodEnd           time.Time
	TotalTradesReplayed int
}

type supabaseBacktestRunRow struct {
	Symbol              string         `json:"symbol"`
	RuleType            string         `json:"rule_type"`
	Timeframe           string         `json:"timeframe"`
	Params              map[string]any `json:"params"`
	PeriodStart         string         `json:"period_start"`
	PeriodEnd           string         `json:"period_end"`
	TotalTradesReplayed int            `json:"total_trades_replayed"`
	TotalSignals        int            `json:"total_signals"`
	Resolved            int            `json:"resolved"`
	Wins                int            `json:"wins"`
	Losses              int            `json:"losses"`
	Expired             int            `json:"expired"`
	WinRate             float64        `json:"win_rate"`
	GrossAvgR           float64        `json:"gross_avg_r"`
	NetAvgR             float64        `json:"net_avg_r"`
	GrossTotalR         float64        `json:"gross_total_r"`
	NetTotalR           float64        `json:"net_total_r"`
}

// SaveRun inserts one row recording a completed backtest run's parameters
// and headline summary. Each call creates a new row (a historical log of
// every backtest ever run), rather than upserting over a prior run for the
// same symbol/rule/window, so results aren't silently overwritten as rule
// thresholds are tuned over time.
func (w *SupabaseWriter) SaveRun(ctx context.Context, run Run, summary Summary) error {
	if !w.IsConfigured() {
		return fmt.Errorf("supabase backtest writer is not configured")
	}

	params := run.Params
	if params == nil {
		params = map[string]any{}
	}

	row := supabaseBacktestRunRow{
		Symbol:              run.Symbol,
		RuleType:            run.RuleType,
		Timeframe:           run.Timeframe,
		Params:              params,
		PeriodStart:         run.PeriodStart.UTC().Format("2006-01-02"),
		PeriodEnd:           run.PeriodEnd.UTC().Format("2006-01-02"),
		TotalTradesReplayed: run.TotalTradesReplayed,
		TotalSignals:        summary.TotalSignals,
		Resolved:            summary.Resolved,
		Wins:                summary.Wins,
		Losses:              summary.Losses,
		Expired:             summary.Expired,
		WinRate:             summary.WinRate,
		GrossAvgR:           summary.GrossAvgR,
		NetAvgR:             summary.NetAvgR,
		GrossTotalR:         summary.GrossTotalR,
		NetTotalR:           summary.NetTotalR,
	}

	payload, err := json.Marshal(row)
	if err != nil {
		return fmt.Errorf("encode backtest run row: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, w.url+"/rest/v1/backtest_runs", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create backtest run request: %w", err)
	}

	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("apikey", w.secretKey)
	request.Header.Set("Authorization", "Bearer "+w.secretKey)
	request.Header.Set("Prefer", "return=minimal")

	response, err := w.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("request backtest run insert: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("backtest run insert failed with status %d", response.StatusCode)
	}

	return nil
}
