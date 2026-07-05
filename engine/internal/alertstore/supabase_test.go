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
		UserID:         "user-1",
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
