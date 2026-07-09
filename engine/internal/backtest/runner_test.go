package backtest

import (
	"testing"
	"time"

	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/marketstate"
	"sentinelflow/engine/internal/outcome"
)

func mustParse(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		t.Fatalf("parse time %q: %v", value, err)
	}
	return parsed
}

func TestRunnerResolvesTP1WinWithinTriggerCandle(t *testing.T) {
	rule := evaluator.Rule{
		ID:           "test-rule",
		MarketSymbol: "BTCUSDT",
		Name:         "test stacked imbalance",
		RuleType:     "stacked_imbalance",
		Status:       "active",
		Timeframe:    "1m",
		StackedImbalance: &evaluator.StackedImbalanceParams{
			ConfirmationRows:    1,
			ThresholdMultiplier: 150,
		},
	}

	runner := NewRunner(rule)

	// Bucket 00:00 - the first trade already shows one-sided (buy-only)
	// volume, which triggers the signal immediately (matches live
	// behavior: Evaluate runs after every trade, not just on candle
	// close). Entry price is the first trade's price (100); the stop
	// floor kicks in since the confirmation window has zero range so far.
	trades := []marketstate.Trade{
		{Symbol: "BTCUSDT", Side: "Buy", Price: 100, Size: 10, Timestamp: mustParse(t, "2024-01-01T00:00:00Z")},
		// More buying within the same bucket pushes price up through
		// where TP1 (100.75) will land. Flush() (below) captures this
		// still-open bucket for outcome resolution without needing a
		// second bucket - avoiding a same-trade-momentarily-one-sided
		// signal firing again on the first trade of a new bucket.
		{Symbol: "BTCUSDT", Side: "Buy", Price: 101, Size: 1, Timestamp: mustParse(t, "2024-01-01T00:00:10Z")},
	}

	runner.ReplayDay(trades)
	runner.Flush()

	signals := runner.Signals()
	if len(signals) != 1 {
		t.Fatalf("expected exactly 1 signal, got %d", len(signals))
	}

	signal := signals[0]
	if signal.Event.Side != "buy" {
		t.Fatalf("expected buy side signal, got %q", signal.Event.Side)
	}
	if signal.Outcome.Status != outcome.StatusTP1Hit {
		t.Fatalf("expected TP1 hit, got status %q (note: %s)", signal.Outcome.Status, signal.Outcome.Note)
	}
	if signal.Outcome.RMultiple <= 0 {
		t.Fatalf("expected a positive R-multiple for a TP1 win, got %f", signal.Outcome.RMultiple)
	}
}

func TestRunnerResolvesStopLossWithinTriggerCandle(t *testing.T) {
	rule := evaluator.Rule{
		ID:           "test-rule",
		MarketSymbol: "BTCUSDT",
		Name:         "test stacked imbalance",
		RuleType:     "stacked_imbalance",
		Status:       "active",
		Timeframe:    "1m",
		StackedImbalance: &evaluator.StackedImbalanceParams{
			ConfirmationRows:    1,
			ThresholdMultiplier: 150,
		},
	}

	runner := NewRunner(rule)

	trades := []marketstate.Trade{
		{Symbol: "BTCUSDT", Side: "Buy", Price: 100, Size: 10, Timestamp: mustParse(t, "2024-01-01T00:00:00Z")},
		// Price reverses hard against the buy signal within the same
		// bucket, breaching the stop (99.25) before any target. Flush()
		// captures this still-open bucket for outcome resolution.
		{Symbol: "BTCUSDT", Side: "Sell", Price: 99, Size: 1, Timestamp: mustParse(t, "2024-01-01T00:00:10Z")},
	}

	runner.ReplayDay(trades)
	runner.Flush()

	signals := runner.Signals()
	if len(signals) != 1 {
		t.Fatalf("expected exactly 1 signal, got %d", len(signals))
	}

	if status := signals[0].Outcome.Status; status != outcome.StatusStopHit {
		t.Fatalf("expected stop hit, got status %q", status)
	}
	if signals[0].Outcome.RMultiple != -1 {
		t.Fatalf("expected -1R for a stop-loss hit, got %f", signals[0].Outcome.RMultiple)
	}
}

func TestRunnerNoSignalWhenRuleInactive(t *testing.T) {
	rule := evaluator.Rule{
		ID:           "test-rule",
		MarketSymbol: "BTCUSDT",
		RuleType:     "stacked_imbalance",
		Status:       "paused",
		Timeframe:    "1m",
		StackedImbalance: &evaluator.StackedImbalanceParams{
			ConfirmationRows:    1,
			ThresholdMultiplier: 150,
		},
	}

	runner := NewRunner(rule)
	runner.ReplayDay([]marketstate.Trade{
		{Symbol: "BTCUSDT", Side: "Buy", Price: 100, Size: 10, Timestamp: mustParse(t, "2024-01-01T00:00:00Z")},
	})
	runner.Flush()

	if signals := runner.Signals(); len(signals) != 0 {
		t.Fatalf("expected no signals for an inactive rule, got %d", len(signals))
	}
}

func TestRunnerExpiresSignalWithNoFurtherHistory(t *testing.T) {
	rule := evaluator.Rule{
		ID:           "test-rule",
		MarketSymbol: "BTCUSDT",
		RuleType:     "stacked_imbalance",
		Status:       "active",
		Timeframe:    "1m",
		StackedImbalance: &evaluator.StackedImbalanceParams{
			ConfirmationRows:    1,
			ThresholdMultiplier: 150,
		},
	}

	runner := NewRunner(rule)
	// Only one trade in one bucket: the signal fires but there is no
	// subsequent price history at all to resolve it against.
	runner.ReplayDay([]marketstate.Trade{
		{Symbol: "BTCUSDT", Side: "Buy", Price: 100, Size: 10, Timestamp: mustParse(t, "2024-01-01T00:00:00Z")},
	})
	runner.Flush()

	signals := runner.Signals()
	if len(signals) != 1 {
		t.Fatalf("expected exactly 1 signal, got %d", len(signals))
	}
	if status := signals[0].Outcome.Status; status != outcome.StatusExpired {
		t.Fatalf("expected expired status with no further history, got %q", status)
	}
}

func TestSummarizeComputesGrossAndNetR(t *testing.T) {
	signals := []Signal{
		{
			Event: evaluator.Event{
				TradePlan: evaluator.TradePlan{EntryPrice: 100, StopLoss: 99},
			},
			Outcome: outcome.Result{Status: outcome.StatusTP1Hit, RMultiple: 1},
		},
		{
			Event: evaluator.Event{
				TradePlan: evaluator.TradePlan{EntryPrice: 100, StopLoss: 99},
			},
			Outcome: outcome.Result{Status: outcome.StatusStopHit, RMultiple: -1},
		},
		{
			Event:   evaluator.Event{},
			Outcome: outcome.Result{Status: outcome.StatusExpired},
		},
	}

	summary := Summarize(signals)

	if summary.TotalSignals != 3 {
		t.Fatalf("expected 3 total signals, got %d", summary.TotalSignals)
	}
	if summary.Resolved != 2 || summary.Wins != 1 || summary.Losses != 1 || summary.Expired != 1 {
		t.Fatalf("unexpected counts: %+v", summary)
	}
	if summary.WinRate != 0.5 {
		t.Fatalf("expected 50%% win rate, got %f", summary.WinRate)
	}
	if summary.GrossAvgR != 0 {
		t.Fatalf("expected 0 gross avg R (a +1R win and a -1R loss average out), got %f", summary.GrossAvgR)
	}
	// Net R must be strictly lower than gross R once realistic trading
	// costs are applied to both trades.
	if summary.NetAvgR >= summary.GrossAvgR {
		t.Fatalf("expected net avg R (%f) below gross avg R (%f) once costs are applied", summary.NetAvgR, summary.GrossAvgR)
	}
}
