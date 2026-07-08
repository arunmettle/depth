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

// addShapedCandle drives two same-side trades into a bucket so the
// resulting candle has a controlled open/high/low/close and a dominant
// side, which the simple addCandleTrade helper (fixed prices) can't
// produce. Using only one side's volume keeps dominantSide() unambiguous
// (dominant volume > 0 opposing volume).
func addShapedCandle(t *testing.T, state *marketstate.State, symbol string, bucketStart time.Time, openPrice float64, closePrice float64, dominantSide string, dominantVolume float64) {
	t.Helper()

	state.UpdateTrade(marketstate.Trade{
		Price:     openPrice,
		Side:      dominantSide,
		Size:      dominantVolume / 2,
		Symbol:    symbol,
		Timestamp: bucketStart.Add(5 * time.Second),
	})

	state.UpdateTrade(marketstate.Trade{
		Price:     closePrice,
		Side:      dominantSide,
		Size:      dominantVolume / 2,
		Symbol:    symbol,
		Timestamp: bucketStart.Add(30 * time.Second),
	})
}

func TestEvaluateEmitsTrappedTradersEventForTrappedBuyers(t *testing.T) {
	state := marketstate.New()
	start := time.Date(2026, 7, 5, 6, 0, 0, 0, time.UTC)

	// Prior candle: aggressive buy breakout from 100000 up to 100100.
	addShapedCandle(t, state, "BTCUSDT", start, 100000, 100100, "Buy", 10)
	// Current candle: sell reversal that round-trips back below the prior
	// candle's low of 100000, trapping the breakout buyers.
	addShapedCandle(t, state, "BTCUSDT", start.Add(1*time.Minute), 100090, 99900, "Sell", 7)

	evaluator := New(state)
	event, ok := evaluator.Evaluate(Rule{
		ID:           "rule-1",
		MarketSymbol: "BTCUSDT",
		Name:         "BTC trapped traders",
		RuleType:     "trapped_traders",
		Status:       "active",
		Timeframe:    "1m",
		TrappedTraders: &TrappedTradersParams{
			MinAbsorptionVolume: 500000,
			TrapSide:            "both",
		},
	})

	if !ok || event == nil {
		t.Fatalf("expected trapped traders event")
	}

	if event.Side != "sell" {
		t.Fatalf("expected sell side (trapped buyers), got %s", event.Side)
	}
}

func TestEvaluateEmitsTrappedTradersEventForTrappedSellers(t *testing.T) {
	state := marketstate.New()
	start := time.Date(2026, 7, 5, 6, 0, 0, 0, time.UTC)

	// Prior candle: aggressive sell breakdown from 100100 down to 100000.
	addShapedCandle(t, state, "BTCUSDT", start, 100100, 100000, "Sell", 10)
	// Current candle: buy reversal that round-trips back above the prior
	// candle's high of 100100, trapping the breakdown sellers.
	addShapedCandle(t, state, "BTCUSDT", start.Add(1*time.Minute), 100010, 100200, "Buy", 7)

	evaluator := New(state)
	event, ok := evaluator.Evaluate(Rule{
		ID:           "rule-1",
		MarketSymbol: "BTCUSDT",
		Name:         "BTC trapped traders",
		RuleType:     "trapped_traders",
		Status:       "active",
		Timeframe:    "1m",
		TrappedTraders: &TrappedTradersParams{
			MinAbsorptionVolume: 500000,
			TrapSide:            "both",
		},
	})

	if !ok || event == nil {
		t.Fatalf("expected trapped traders event")
	}

	if event.Side != "buy" {
		t.Fatalf("expected buy side (trapped sellers), got %s", event.Side)
	}
}

func TestEvaluateTrappedTradersRejectsBelowMinAbsorptionVolume(t *testing.T) {
	state := marketstate.New()
	start := time.Date(2026, 7, 5, 6, 0, 0, 0, time.UTC)

	addShapedCandle(t, state, "BTCUSDT", start, 100000, 100100, "Buy", 10)
	addShapedCandle(t, state, "BTCUSDT", start.Add(1*time.Minute), 100090, 99900, "Sell", 7)

	evaluator := New(state)
	event, ok := evaluator.Evaluate(Rule{
		ID:           "rule-1",
		MarketSymbol: "BTCUSDT",
		Name:         "BTC trapped traders",
		RuleType:     "trapped_traders",
		Status:       "active",
		Timeframe:    "1m",
		TrappedTraders: &TrappedTradersParams{
			// The trap candle's notional volume is ~10 * 100100 = 1,001,000,
			// well below this threshold, so it should not qualify.
			MinAbsorptionVolume: 5_000_000,
			TrapSide:            "both",
		},
	})

	if ok || event != nil {
		t.Fatalf("expected low-volume trap candle to be rejected")
	}
}

func TestEvaluateTrappedTradersRespectsTrapSideFilter(t *testing.T) {
	state := marketstate.New()
	start := time.Date(2026, 7, 5, 6, 0, 0, 0, time.UTC)

	// Trapped-buyers setup (bearish signal), but the rule only wants to
	// catch trapped sellers (bullish signal), so it should not fire.
	addShapedCandle(t, state, "BTCUSDT", start, 100000, 100100, "Buy", 10)
	addShapedCandle(t, state, "BTCUSDT", start.Add(1*time.Minute), 100090, 99900, "Sell", 7)

	evaluator := New(state)
	event, ok := evaluator.Evaluate(Rule{
		ID:           "rule-1",
		MarketSymbol: "BTCUSDT",
		Name:         "BTC trapped traders",
		RuleType:     "trapped_traders",
		Status:       "active",
		Timeframe:    "1m",
		TrappedTraders: &TrappedTradersParams{
			MinAbsorptionVolume: 500000,
			TrapSide:            "sellers",
		},
	})

	if ok || event != nil {
		t.Fatalf("expected trapSide filter to reject a trapped-buyers setup")
	}
}

func TestEvaluateTrappedTradersRejectsWithoutFullReversal(t *testing.T) {
	state := marketstate.New()
	start := time.Date(2026, 7, 5, 6, 0, 0, 0, time.UTC)

	addShapedCandle(t, state, "BTCUSDT", start, 100000, 100100, "Buy", 10)
	// Sell dominant but does not close back below the prior candle's low
	// of 100000, so this is not a full round-trip reversal yet.
	addShapedCandle(t, state, "BTCUSDT", start.Add(1*time.Minute), 100090, 100050, "Sell", 7)

	evaluator := New(state)
	event, ok := evaluator.Evaluate(Rule{
		ID:           "rule-1",
		MarketSymbol: "BTCUSDT",
		Name:         "BTC trapped traders",
		RuleType:     "trapped_traders",
		Status:       "active",
		Timeframe:    "1m",
		TrappedTraders: &TrappedTradersParams{
			MinAbsorptionVolume: 500000,
			TrapSide:            "both",
		},
	})

	if ok || event != nil {
		t.Fatalf("expected partial reversal to be rejected")
	}
}
