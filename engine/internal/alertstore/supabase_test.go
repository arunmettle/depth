package alertstore

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"sentinelflow/engine/internal/alerts"
	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/marketstate"
	"sentinelflow/engine/internal/outcome"
	"sentinelflow/engine/internal/proof"
)

func TestSupabaseStoreUpsertPostsAlertHistoryRow(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/rest/v1/alert_history" {
			t.Fatalf("unexpected request path: %s", request.URL.Path)
		}

		if request.URL.Query().Get("on_conflict") != "id" {
			t.Fatalf("expected on_conflict=id query, got %s", request.URL.RawQuery)
		}

		if request.Header.Get("Prefer") != "resolution=merge-duplicates,return=minimal" {
			t.Fatalf("unexpected Prefer header: %s", request.Header.Get("Prefer"))
		}

		var payload supabaseAlertHistoryRow
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Fatalf("decode alert history payload: %v", err)
		}

		if payload.ID != "alert-1" || payload.UserID != "user-1" {
			t.Fatalf("unexpected payload identity: %+v", payload)
		}

		if payload.DeliveryStatus != "retrying" || payload.ProofMediaType != proof.SVGMediaType {
			t.Fatalf("unexpected payload status or proof media type: %+v", payload)
		}

		if payload.ProofContent == "" || !strings.Contains(payload.Message, "stacked imbalance") {
			t.Fatalf("expected proof content and message in payload: %+v", payload)
		}

		if payload.TradePlanEntryPrice != 100.5 || payload.TradePlanStopLoss != 99.5 ||
			payload.TradePlanTakeProfit1 != 101.5 || payload.TradePlanTakeProfit2 != 102.5 {
			t.Fatalf("expected trade plan fields in payload: %+v", payload)
		}

		writer.WriteHeader(http.StatusCreated)
	}))
	defer server.Close()

	store := NewSupabaseStore(server.URL, "secret-123")

	err := store.Upsert(context.Background(), alerts.Record{
		CreatedAt:      time.Date(2026, 7, 6, 1, 2, 0, 0, time.UTC),
		DeliveryStatus: alerts.StatusRetrying,
		ID:             "alert-1",
		MarketSymbol:   "BTCUSDT",
		Message:        "BTCUSDT 1m buy stacked imbalance confirmed across 3 candles.",
		Proof:          proof.NewSVGArtifact("<svg></svg>"),
		RuleName:       "BTC 1m stacked imbalance",
		Side:           "buy",
		Timeframe:      "1m",
		TradePlan: evaluator.TradePlan{
			EntryPrice:   100.5,
			RiskReward1:  1,
			RiskReward2:  2,
			SignalHigh:   101,
			SignalLow:    99,
			StopLoss:     99.5,
			TakeProfit1:  101.5,
			TakeProfit2:  102.5,
			TriggerPrice: 100.5,
		},
		UserID: "user-1",
	})
	if err != nil {
		t.Fatalf("upsert alert history row: %v", err)
	}
}

func TestSupabaseStoreUpsertRejectsUnconfiguredStore(t *testing.T) {
	store := NewSupabaseStore("", "")
	if err := store.Upsert(context.Background(), alerts.Record{}); err == nil {
		t.Fatal("expected unconfigured alert store to fail")
	}
}

func TestSupabaseStorePendingOutcomeAlertsQueriesAndMapsRows(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/rest/v1/alert_history" {
			t.Fatalf("unexpected request path: %s", request.URL.Path)
		}

		query := request.URL.Query()
		if query.Get("outcome_status") != "eq.pending" {
			t.Fatalf("expected outcome_status=eq.pending filter, got %s", request.URL.RawQuery)
		}
		if query.Get("order") != "created_at.asc" {
			t.Fatalf("expected created_at.asc ordering, got %s", request.URL.RawQuery)
		}
		if query.Get("limit") != "10" {
			t.Fatalf("expected limit=10, got %s", request.URL.RawQuery)
		}
		if !strings.HasPrefix(query.Get("created_at"), "lte.") {
			t.Fatalf("expected created_at lte filter, got %s", request.URL.RawQuery)
		}

		rows := []supabasePendingOutcomeRow{{
			ID:                   "alert-1",
			MarketSymbol:         "BTCUSDT",
			Side:                 "buy",
			Timeframe:            "1m",
			CreatedAt:            "2026-01-01T00:00:00Z",
			TradePlanEntryPrice:  100,
			TradePlanStopLoss:    99,
			TradePlanTakeProfit1: 101,
			TradePlanTakeProfit2: 102,
		}}

		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(rows)
	}))
	defer server.Close()

	store := NewSupabaseStore(server.URL, "secret-123")

	got, err := store.PendingOutcomeAlerts(context.Background(), 2*time.Minute, 10)
	if err != nil {
		t.Fatalf("pending outcome alerts: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("expected 1 pending alert, got %d", len(got))
	}

	if got[0].ID != "alert-1" || got[0].EntryPrice != 100 || got[0].StopLoss != 99 {
		t.Fatalf("unexpected mapped pending alert: %+v", got[0])
	}
}

func TestSupabaseStoreUpdateOutcomePatchesRow(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPatch {
			t.Fatalf("expected PATCH request, got %s", request.Method)
		}

		if request.URL.Query().Get("id") != "eq.alert-1" {
			t.Fatalf("expected id=eq.alert-1 filter, got %s", request.URL.RawQuery)
		}

		var payload map[string]any
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Fatalf("decode outcome update payload: %v", err)
		}

		if payload["outcome_status"] != "tp1_hit" {
			t.Fatalf("expected outcome_status=tp1_hit, got %+v", payload)
		}
		if payload["outcome_r_multiple"] != 1.5 {
			t.Fatalf("expected outcome_r_multiple=1.5, got %+v", payload)
		}

		writer.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	store := NewSupabaseStore(server.URL, "secret-123")

	err := store.UpdateOutcome(context.Background(), outcome.Result{
		AlertID:   "alert-1",
		Status:    outcome.StatusTP1Hit,
		HitPrice:  101,
		HitAt:     time.Date(2026, 1, 1, 0, 5, 0, 0, time.UTC),
		RMultiple: 1.5,
	})
	if err != nil {
		t.Fatalf("update outcome: %v", err)
	}
}

func TestSupabaseStoreUpdateOutcomeRejectsMissingAlertID(t *testing.T) {
	store := NewSupabaseStore("https://example.supabase.co", "secret-123")

	if err := store.UpdateOutcome(context.Background(), outcome.Result{Status: outcome.StatusExpired}); err == nil {
		t.Fatal("expected error when alert id is missing")
	}
}

func TestSupabaseStorePendingOutcomeAlertsRejectsUnconfiguredStore(t *testing.T) {
	store := NewSupabaseStore("", "")
	if _, err := store.PendingOutcomeAlerts(context.Background(), time.Minute, 10); err == nil {
		t.Fatal("expected unconfigured store to fail")
	}
}

func TestSupabaseStoreUpsertCandlePostsCandleHistoryRow(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/rest/v1/candle_history" {
			t.Fatalf("unexpected request path: %s", request.URL.Path)
		}

		if request.URL.Query().Get("on_conflict") != "market_symbol,timeframe,bucket_start" {
			t.Fatalf("unexpected on_conflict query: %s", request.URL.RawQuery)
		}

		if request.Header.Get("Prefer") != "resolution=merge-duplicates,return=minimal" {
			t.Fatalf("unexpected Prefer header: %s", request.Header.Get("Prefer"))
		}

		var payload supabaseCandleRow
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Fatalf("decode candle history payload: %v", err)
		}

		if payload.MarketSymbol != "BTCUSDT" || payload.Timeframe != "1m" {
			t.Fatalf("unexpected payload identity: %+v", payload)
		}
		if payload.High != 101 || payload.Low != 99 {
			t.Fatalf("unexpected payload high/low: %+v", payload)
		}

		writer.WriteHeader(http.StatusCreated)
	}))
	defer server.Close()

	store := NewSupabaseStore(server.URL, "secret-123")

	err := store.UpsertCandle(context.Background(), marketstate.Candle{
		BucketStart: time.Date(2026, 1, 1, 0, 5, 0, 0, time.UTC),
		Close:       100,
		High:        101,
		Low:         99,
		Open:        100,
		Symbol:      "BTCUSDT",
		Timeframe:   "1m",
	})
	if err != nil {
		t.Fatalf("upsert candle: %v", err)
	}
}

func TestSupabaseStoreFetchKlinesQueriesCandleHistory(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/rest/v1/candle_history" {
			t.Fatalf("unexpected request path: %s", request.URL.Path)
		}

		query := request.URL.Query()
		if query.Get("market_symbol") != "eq.BTCUSDT" {
			t.Fatalf("expected market_symbol filter, got %s", request.URL.RawQuery)
		}
		if query.Get("timeframe") != "eq.1m" {
			t.Fatalf("expected timeframe filter, got %s", request.URL.RawQuery)
		}
		if len(query["bucket_start"]) != 2 {
			t.Fatalf("expected two bucket_start bounds, got %v", query["bucket_start"])
		}

		body := []map[string]any{
			{"bucket_start": "2026-01-01T00:05:00Z", "open": 100, "high": 101, "low": 99, "close": 100.5},
		}
		_ = json.NewEncoder(writer).Encode(body)
	}))
	defer server.Close()

	store := NewSupabaseStore(server.URL, "secret-123")

	got, err := store.FetchKlines(context.Background(), "BTCUSDT", 1, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 1, 1, 1, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("fetch klines: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("expected 1 kline, got %d", len(got))
	}

	if got[0].High != 101 || got[0].Low != 99 {
		t.Fatalf("unexpected kline values: %+v", got[0])
	}
}

func TestSupabaseStoreFetchKlinesRejectsUnsupportedInterval(t *testing.T) {
	store := NewSupabaseStore("https://example.supabase.co", "secret-123")

	if _, err := store.FetchKlines(context.Background(), "BTCUSDT", 3, time.Now().Add(-time.Hour), time.Now()); err == nil {
		t.Fatal("expected error for unsupported interval")
	}
}
