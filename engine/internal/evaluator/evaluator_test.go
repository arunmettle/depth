package evaluator

import (
	"testing"
	"time"

	"sentinelflow/engine/internal/marketstate"
)

func TestEvaluateEmitsStackedImbalanceEvent(t *testing.T) {
	state := marketstate.New()
	start := time.Date(2026, 7, 5, 6, 0, 0, 0, time.UTC)

	addCandleTrade(t, state, "BTCUSDT", start, 0.9, 0.2)
	addCandleTrade(t, state, "BTCUSDT", start.Add(1*time.Minute), 1.1, 0.3)
	addCandleTrade(t, state, "BTCUSDT", start.Add(2*time.Minute), 1.2, 0.25)

	evaluator := New(state)
	event, ok := evaluator.Evaluate(Rule{
		ID:           "rule-1",
		MarketSymbol: "BTCUSDT",
		Name:         "BTC stacked",
		RuleType:     "stacked_imbalance",
		Status:       "active",
		Timeframe:    "1m",
		StackedImbalance: &StackedImbalanceParams{
			ConfirmationRows:    3,
			ThresholdMultiplier: 300,
		},
	})

	if !ok || event == nil {
		t.Fatalf("expected stacked imbalance event")
	}

	if event.Side != "buy" {
		t.Fatalf("expected buy side, got %s", event.Side)
	}

	if event.Symbol != "BTCUSDT" || event.Timeframe != "1m" {
		t.Fatalf("unexpected event target: %s %s", event.Symbol, event.Timeframe)
	}

	if event.TradePlan.EntryPrice != 100010 || event.TradePlan.StopLoss != 100000 {
		t.Fatalf("unexpected trade plan core values: %+v", event.TradePlan)
	}

	if event.TradePlan.TakeProfit1 != 100020 || event.TradePlan.TakeProfit2 != 100030 {
		t.Fatalf("unexpected trade plan targets: %+v", event.TradePlan)
	}
}

func TestEvaluateSuppressesDuplicateForSameBucket(t *testing.T) {
	state := marketstate.New()
	start := time.Date(2026, 7, 5, 6, 0, 0, 0, time.UTC)

	addCandleTrade(t, state, "BTCUSDT", start, 1.0, 0.2)
	addCandleTrade(t, state, "BTCUSDT", start.Add(1*time.Minute), 1.0, 0.2)
	addCandleTrade(t, state, "BTCUSDT", start.Add(2*time.Minute), 1.0, 0.2)

	evaluator := New(state)
	rule := Rule{
		ID:           "rule-1",
		MarketSymbol: "BTCUSDT",
		Name:         "BTC stacked",
		RuleType:     "stacked_imbalance",
		Status:       "active",
		Timeframe:    "1m",
		StackedImbalance: &StackedImbalanceParams{
			ConfirmationRows:    3,
			ThresholdMultiplier: 300,
		},
	}

	if event, ok := evaluator.Evaluate(rule); !ok || event == nil {
		t.Fatalf("expected first evaluation to emit")
	}

	if event, ok := evaluator.Evaluate(rule); ok || event != nil {
		t.Fatalf("expected duplicate evaluation to be suppressed")
	}
}

func TestEvaluateAllowsNextBucketAfterSuppression(t *testing.T) {
	state := marketstate.New()
	start := time.Date(2026, 7, 5, 6, 0, 0, 0, time.UTC)

	addCandleTrade(t, state, "BTCUSDT", start, 1.0, 0.2)
	addCandleTrade(t, state, "BTCUSDT", start.Add(1*time.Minute), 1.0, 0.2)
	addCandleTrade(t, state, "BTCUSDT", start.Add(2*time.Minute), 1.0, 0.2)

	evaluator := New(state)
	rule := Rule{
		ID:           "rule-1",
		MarketSymbol: "BTCUSDT",
		Name:         "BTC stacked",
		RuleType:     "stacked_imbalance",
		Status:       "active",
		Timeframe:    "1m",
		StackedImbalance: &StackedImbalanceParams{
			ConfirmationRows:    3,
			ThresholdMultiplier: 300,
		},
	}

	if _, ok := evaluator.Evaluate(rule); !ok {
		t.Fatalf("expected first evaluation to emit")
	}

	addCandleTrade(t, state, "BTCUSDT", start.Add(3*time.Minute), 1.0, 0.2)

	if event, ok := evaluator.Evaluate(rule); !ok || event == nil {
		t.Fatalf("expected next bucket evaluation to emit")
	}
}

func TestEvaluateRejectsMixedSideWindow(t *testing.T) {
	state := marketstate.New()
	start := time.Date(2026, 7, 5, 6, 0, 0, 0, time.UTC)

	addCandleTrade(t, state, "BTCUSDT", start, 1.0, 0.2)
	addCandleTrade(t, state, "BTCUSDT", start.Add(1*time.Minute), 0.2, 1.0)
	addCandleTrade(t, state, "BTCUSDT", start.Add(2*time.Minute), 1.0, 0.2)

	evaluator := New(state)
	event, ok := evaluator.Evaluate(Rule{
		ID:           "rule-1",
		MarketSymbol: "BTCUSDT",
		Name:         "BTC stacked",
		RuleType:     "stacked_imbalance",
		Status:       "active",
		Timeframe:    "1m",
		StackedImbalance: &StackedImbalanceParams{
			ConfirmationRows:    3,
			ThresholdMultiplier: 300,
		},
	})

	if ok || event != nil {
		t.Fatalf("expected mixed side window to fail evaluation")
	}
}

func addCandleTrade(t *testing.T, state *marketstate.State, symbol string, bucketStart time.Time, buyVolume float64, sellVolume float64) {
	t.Helper()

	if buyVolume > 0 {
		state.UpdateTrade(marketstate.Trade{
			Price:     100000,
			Side:      "Buy",
			Size:      buyVolume,
			Symbol:    symbol,
			Timestamp: bucketStart.Add(10 * time.Second),
		})
	}

	if sellVolume > 0 {
		state.UpdateTrade(marketstate.Trade{
			Price:     100010,
			Side:      "Sell",
			Size:      sellVolume,
			Symbol:    symbol,
			Timestamp: bucketStart.Add(20 * time.Second),
		})
	}
}
