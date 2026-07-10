package backtest

import (
	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/marketstate"
)

// SMATrendFilter builds a TrendFilter that only keeps a fired signal when
// its direction agrees with a simple trend read on the same timeframe: a
// "buy" signal is kept only if the current close is above the simple
// moving average of the last period closed candles, a "sell" signal only
// if it's below. This is a research variant (see WithTrendFilter) intended
// to test whether filtering out counter-trend signals turns a small-but-
// real gross edge into a net-positive one after costs; it is never applied
// to the production evaluator.
func SMATrendFilter(period int) TrendFilter {
	return func(state *marketstate.State, event evaluator.Event) bool {
		if period <= 0 {
			return true
		}

		recent := state.RecentCandles(event.Symbol, event.Timeframe, period)
		if len(recent) < period {
			// Not enough history yet to judge a trend - be conservative
			// and discard rather than assume alignment.
			return false
		}

		sum := 0.0
		for _, candle := range recent {
			sum += candle.Close
		}
		sma := sum / float64(len(recent))

		current, ok := state.CurrentCandle(event.Symbol, event.Timeframe)
		if !ok {
			return false
		}

		switch event.Side {
		case "buy":
			return current.Close > sma
		case "sell":
			return current.Close < sma
		default:
			return false
		}
	}
}
