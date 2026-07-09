package historicaldata

import "sentinelflow/engine/internal/marketstate"

// replayTimeframes mirrors the timeframes the live engine evaluates
// (see engine/internal/evaluator.LaunchRules). Keeping this list in one
// place makes it obvious the backtest replay covers exactly what
// production covers, no more and no less.
var replayTimeframes = []string{"1m", "5m", "15m"}

// Replayer builds real candle history across an arbitrary number of days by
// replaying each day's trades, in chronological order, through one shared
// marketstate.State - the exact same candle-bucketing code the live engine
// uses. This is a deliberate design choice: a backtest that reimplements
// candle-building separately from production risks silently drifting from
// what live alerts actually see. Feeding historical trades through
// marketstate.State.UpdateTrade guarantees byte-for-byte identical bucketing
// logic between backtest and live.
type Replayer struct {
	symbol        string
	state         *marketstate.State
	onCandleClose func(marketstate.Candle)
}

// NewReplayer creates a Replayer for symbol. onCandleClose is invoked once
// for every candle that closes during replay (across all of replayTimeframes),
// in the same order trades are fed in via ReplayDay - exactly the callback
// contract marketstate.State already offers live callers.
func NewReplayer(symbol string, onCandleClose func(marketstate.Candle)) *Replayer {
	state := marketstate.New()
	state.SetOnCandleClose(onCandleClose)

	return &Replayer{
		symbol:        symbol,
		state:         state,
		onCandleClose: onCandleClose,
	}
}

// ReplayDay feeds one day's (or any contiguous batch's) trades through the
// replayer's shared state. Trades must already be sorted ascending by
// timestamp (ParseDailyArchive and FetchDailyTrades both guarantee this).
// Calling ReplayDay repeatedly with successive days lets candles correctly
// roll across day boundaries, the same as continuous live streaming would.
func (r *Replayer) ReplayDay(trades []marketstate.Trade) {
	for _, trade := range trades {
		r.state.UpdateTrade(trade)
	}
}

// Flush emits the final still-open candle for each timeframe so the last
// partial bucket of a replay isn't silently dropped. Call this once after
// all days have been replayed.
func (r *Replayer) Flush() {
	for _, timeframe := range replayTimeframes {
		if candle, ok := r.state.CurrentCandle(r.symbol, timeframe); ok && r.onCandleClose != nil {
			// CurrentCandle is a read, not a close event, so it never goes
			// through marketstate's own onCandleClose callback - Flush has
			// to invoke it directly to avoid losing the final partial candle.
			r.onCandleClose(candle)
		}
	}
}

// BuildCandles is a convenience wrapper around Replayer for callers with a
// single pre-loaded batch of trades (typical in tests, or for a single-day
// analysis) rather than a multi-day streaming backfill. It returns closed
// candles grouped by timeframe, in chronological order.
func BuildCandles(symbol string, trades []marketstate.Trade) map[string][]marketstate.Candle {
	closed := make(map[string][]marketstate.Candle)

	replayer := NewReplayer(symbol, func(candle marketstate.Candle) {
		closed[candle.Timeframe] = append(closed[candle.Timeframe], candle)
	})
	replayer.ReplayDay(trades)
	replayer.Flush()

	return closed
}
