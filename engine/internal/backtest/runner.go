// Package backtest replays historical trades through the exact same
// evaluator and outcome-resolution code the live engine uses, so a
// historical signal count and win rate can be trusted to match what live
// alerting would actually have produced - not a separately reimplemented
// approximation. See engine/internal/historicaldata for where the
// underlying trade archives come from, and
// VISUAL_PROOF_AND_BACKTEST_GOALS.md for the wider goal this serves.
package backtest

import (
	"fmt"
	"time"

	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/klines"
	"sentinelflow/engine/internal/marketstate"
	"sentinelflow/engine/internal/outcome"
)

// replayTimeframes mirrors engine/internal/historicaldata.replayTimeframes
// and evaluator.LaunchRules - the exact set of timeframes the live engine
// evaluates rules against.
var replayTimeframes = []string{"1m", "5m", "15m"}

// Signal is one historical alert the rule would have fired on live,
// together with its resolved real-price outcome.
type Signal struct {
	Event   evaluator.Event
	Outcome outcome.Result
}

// Runner replays historical trades through a dedicated marketstate.State +
// evaluator.Evaluator pair - never the live engine's shared state - and
// records every Event the rule would have fired, exactly mirroring how
// engine/internal/bybit.PublicTradeStream.evaluateRulesForSymbol calls
// Evaluate after every single trade (not just on candle close), since
// stacked-imbalance and trapped-traders signals can fire mid-candle as
// running volume ratios cross a threshold.
type Runner struct {
	rule      evaluator.Rule
	state     *marketstate.State
	evaluator *evaluator.Evaluator
	events    []evaluator.Event
	candles   map[string][]marketstate.Candle
}

// NewRunner creates a Runner that evaluates a single rule as historical
// trades are replayed through it via ReplayDay.
func NewRunner(rule evaluator.Rule) *Runner {
	state := marketstate.New()

	r := &Runner{
		rule:    rule,
		state:   state,
		candles: make(map[string][]marketstate.Candle),
	}
	r.evaluator = evaluator.New(state)

	state.SetOnCandleClose(func(candle marketstate.Candle) {
		r.candles[candle.Timeframe] = append(r.candles[candle.Timeframe], candle)
	})

	return r
}

// ReplayDay feeds one day's (or any contiguous batch's) trades through the
// runner, evaluating the rule after every trade - the same cadence the live
// stream uses. Trades must already be sorted ascending by timestamp.
func (r *Runner) ReplayDay(trades []marketstate.Trade) {
	for _, trade := range trades {
		r.state.UpdateTrade(trade)

		event, ok := r.evaluator.Evaluate(r.rule)
		if !ok || event == nil {
			continue
		}

		r.events = append(r.events, *event)
	}
}

// Flush emits the final still-open candle for each timeframe, the same as
// historicaldata.Replayer.Flush, so the last partial bucket of a replay
// isn't silently missing from outcome resolution. Call this once after all
// days have been replayed, before calling Signals.
func (r *Runner) Flush() {
	for _, timeframe := range replayTimeframes {
		if candle, ok := r.state.CurrentCandle(r.rule.MarketSymbol, timeframe); ok {
			r.candles[timeframe] = append(r.candles[timeframe], candle)
		}
	}
}

// Signals resolves every recorded Event's real outcome against the
// replayed candle history and returns them in the order they fired. Call
// this only after all replay is complete (and Flush has been called).
func (r *Runner) Signals() []Signal {
	signals := make([]Signal, 0, len(r.events))

	for _, event := range r.events {
		signals = append(signals, Signal{
			Event:   event,
			Outcome: resolveOutcome(event, r.candles[event.Timeframe]),
		})
	}

	return signals
}

// resolveOutcome walks forward through the candles that occur on or after
// the signal's own bucket (matching the live outcome.Resolver, which fetches
// klines starting from the alert's own CreatedAt bucket, since price can
// reverse into a stop or target within the remainder of the very candle
// that produced the signal), for up to outcome.DefaultResolutionWindow,
// applying the exact same stop/TP hit-order rule real alerts are resolved
// with.
func resolveOutcome(event evaluator.Event, candles []marketstate.Candle) outcome.Result {
	alert := outcome.PendingAlert{
		ID:           fmt.Sprintf("%s@%s", event.RuleID, event.BucketStart.UTC().Format(time.RFC3339)),
		MarketSymbol: event.Symbol,
		Side:         event.Side,
		Timeframe:    event.Timeframe,
		CreatedAt:    event.BucketStart,
		EntryPrice:   event.TradePlan.EntryPrice,
		StopLoss:     event.TradePlan.StopLoss,
		TakeProfit1:  event.TradePlan.TakeProfit1,
		TakeProfit2:  event.TradePlan.TakeProfit2,
	}

	for _, candle := range candles {
		if candle.BucketStart.Before(event.BucketStart) {
			continue
		}

		// Matches outcome.Resolver's own resolution window: a stop/TP hit
		// that only resolves after 48h is one live alerting would have
		// already marked expired, so a backtest must not credit it as a
		// win or loss either.
		if candle.BucketStart.Sub(event.BucketStart) > outcome.DefaultResolutionWindow {
			break
		}

		kline := klines.Kline{
			StartTime: candle.BucketStart,
			Open:      candle.Open,
			High:      candle.High,
			Low:       candle.Low,
			Close:     candle.Close,
		}

		if result, hit := outcome.EvaluateCandle(alert, kline); hit {
			return result
		}
	}

	return outcome.Result{
		AlertID: alert.ID,
		Status:  outcome.StatusExpired,
		Note:    "No stop-loss or take-profit level was reached within the available backtest history.",
	}
}
