package alerts

import (
	"testing"
	"time"

	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/proof"
)

func TestNewRecordBuildsStableAlertShape(t *testing.T) {
	event := evaluator.Event{
		BucketStart: time.Date(2026, 7, 5, 6, 2, 0, 0, time.UTC),
		Message:     "BTCUSDT 1m buy stacked imbalance confirmed across 3 candles.",
		RuleID:      "rule-1",
		RuleName:    "BTC 1m stacked imbalance",
		Side:        "buy",
		Symbol:      "BTCUSDT",
		Timeframe:   "1m",
	}

	record := NewRecord(event, proof.NewSVGArtifact("<svg></svg>"))

	if record.DeliveryStatus != StatusEvaluated {
		t.Fatalf("unexpected delivery status: %s", record.DeliveryStatus)
	}

	if record.ID == "" || record.MarketSymbol != "BTCUSDT" || record.RuleName != "BTC 1m stacked imbalance" {
		t.Fatalf("unexpected record shape: %+v", record)
	}

	if record.Proof.ContentHash == "" {
		t.Fatal("expected proof artifact metadata to be preserved")
	}
}

func TestNewRecordIsDeterministic(t *testing.T) {
	event := evaluator.Event{
		BucketStart: time.Date(2026, 7, 5, 6, 2, 0, 0, time.UTC),
		Message:     "message",
		RuleID:      "rule-1",
		RuleName:    "Rule",
		Side:        "buy",
		Symbol:      "BTCUSDT",
		Timeframe:   "1m",
	}

	left := NewRecord(event, proof.NewSVGArtifact("<svg>one</svg>"))
	right := NewRecord(event, proof.NewSVGArtifact("<svg>two</svg>"))

	if left.ID != right.ID {
		t.Fatalf("expected deterministic record id, got %s vs %s", left.ID, right.ID)
	}
}
