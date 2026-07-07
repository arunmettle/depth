package proof

import (
	"strings"
	"testing"
	"time"

	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/marketstate"
)

func TestRenderSVGIncludesCoreProofContent(t *testing.T) {
	svg := RenderSVG(Snapshot{
		Event: evaluator.Event{
			BucketStart: time.Date(2026, 7, 5, 6, 2, 0, 0, time.UTC),
			Message:     "BTCUSDT 1m buy stacked imbalance confirmed across 3 candles at 300% threshold.",
			RuleID:      "rule-1",
			RuleName:    "BTC 1m stacked imbalance",
			Side:        "buy",
			Symbol:      "BTCUSDT",
			Timeframe:   "1m",
			TradePlan: evaluator.TradePlan{
				EntryPrice:   104050.25,
				StopLoss:     103980,
				TakeProfit1:  104120.50,
				TakeProfit2:  104190.75,
				TriggerPrice: 104050.25,
			},
		},
		Candles: []marketstate.Candle{
			{BucketStart: time.Date(2026, 7, 5, 6, 0, 0, 0, time.UTC), BuyVolume: 1.0, SellVolume: 0.2, Close: 104000.5, TotalVolume: 1.2},
			{BucketStart: time.Date(2026, 7, 5, 6, 1, 0, 0, time.UTC), BuyVolume: 1.1, SellVolume: 0.25, Close: 104020.5, TotalVolume: 1.35},
			{BucketStart: time.Date(2026, 7, 5, 6, 2, 0, 0, time.UTC), BuyVolume: 1.2, SellVolume: 0.3, Close: 104050.25, TotalVolume: 1.5},
		},
	})

	for _, expected := range []string{
		`<svg`,
		`Sentinel Flow Proof`,
		`BTCUSDT BUY 1m`,
		`BUY IMBALANCE`,
		`Flow Strip`,
		`Trade Plan`,
		`Entry`,
		`103980.00`,
		`104120.50`,
		`Signal range`,
	} {
		if !strings.Contains(svg, expected) {
			t.Fatalf("expected SVG to contain %q", expected)
		}
	}
}

func TestRenderSVGEscapesUserVisibleText(t *testing.T) {
	svg := RenderSVG(Snapshot{
		Event: evaluator.Event{
			BucketStart: time.Date(2026, 7, 5, 6, 2, 0, 0, time.UTC),
			Message:     `<unsafe>`,
			RuleID:      "rule-1",
			RuleName:    `Rule & <Proof>`,
			Side:        "sell",
			Symbol:      "BTCUSDT",
			Timeframe:   "1m",
		},
		Candles: []marketstate.Candle{
			{BucketStart: time.Date(2026, 7, 5, 6, 2, 0, 0, time.UTC), BuyVolume: 0.2, SellVolume: 1.0, Close: 103990, TotalVolume: 1.2},
		},
	})

	if strings.Contains(svg, `<unsafe>`) {
		t.Fatal("expected SVG to escape unsafe message content")
	}

	if !strings.Contains(svg, `Rule &amp; &lt;Proof&gt;`) {
		t.Fatal("expected SVG to escape unsafe rule name content")
	}
}
