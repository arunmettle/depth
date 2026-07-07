package telegram

import (
	"strings"
	"testing"
	"time"

	"sentinelflow/engine/internal/alerts"
	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/proof"
)

func TestFormatCaptionIncludesCoreAlertContext(t *testing.T) {
	caption := FormatCaption(alerts.Record{
		CreatedAt:      time.Date(2026, 7, 5, 6, 2, 0, 0, time.UTC),
		DeliveryStatus: alerts.StatusEvaluated,
		ID:             "record-1",
		MarketSymbol:   "BTCUSDT",
		Message:        "BTCUSDT 1m buy stacked imbalance confirmed.",
		Proof:          proof.NewSVGArtifact("<svg></svg>"),
		RuleName:       "BTC 1m stacked imbalance",
		Side:           "buy",
		Timeframe:      "1m",
	})

	for _, expected := range []string{
		"BTCUSDT | BUY | 1m",
		"BTC 1m stacked imbalance",
		"Recorded 2026-07-05T06:02:00Z",
	} {
		if !strings.Contains(caption, expected) {
			t.Fatalf("expected caption to contain %q", expected)
		}
	}
}

func TestFormatCaptionIncludesTradePlanWhenPresent(t *testing.T) {
	caption := FormatCaption(alerts.Record{
		CreatedAt:      time.Date(2026, 7, 5, 6, 2, 0, 0, time.UTC),
		DeliveryStatus: alerts.StatusEvaluated,
		ID:             "record-1",
		MarketSymbol:   "BTCUSDT",
		Message:        "BTCUSDT 1m buy stacked imbalance confirmed.",
		Proof:          proof.NewSVGArtifact("<svg></svg>"),
		RuleName:       "BTC 1m stacked imbalance",
		Side:           "buy",
		Timeframe:      "1m",
		TradePlan: evaluator.TradePlan{
			EntryPrice:  104050.25,
			RiskReward1: 1,
			RiskReward2: 2,
			SignalHigh:  104050.25,
			SignalLow:   103980,
			StopLoss:    103980,
			TakeProfit1: 104120.50,
			TakeProfit2: 104190.75,
		},
	})

	for _, expected := range []string{
		"Setup: stacked imbalance confirmed",
		"Entry: 104050.25",
		"Invalidation: 103980.00",
		"Targets: 104120.50 (1.0R) / 104190.75 (2.0R)",
		"Signal window: 103980.00 to 104050.25",
	} {
		if !strings.Contains(caption, expected) {
			t.Fatalf("expected caption to contain %q", expected)
		}
	}
}
