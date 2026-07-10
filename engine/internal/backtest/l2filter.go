package backtest

import (
	"time"

	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/l2book"
	"sentinelflow/engine/internal/marketstate"
)

// L2ImbalanceFilter builds a TrendFilter that keeps a fired Event only if
// real L2 order-book imbalance (from series, e.g. built via
// l2book.ParseGzipCSV against a Tardis.dev incremental_book_L2 dataset)
// agrees with the signal's direction at the moment it fired.
//
// This tests the hypothesis from the L2 imbalance/forward-return
// prototype (see goal4-orderbook-data): raw order-book imbalance is a
// real but tiny (0.5-2bps), fast-decaying signal - too small to trade
// standalone at the horizons this product's alerts hold for, but
// potentially useful as a confirming filter on top of the existing
// trapped_traders/stacked_imbalance rules, which target much larger
// (30-200+bps) moves.
//
// A "buy" event is kept only if book imbalance >= minAbsImbalance
// (bid-heavy, confirming upside pressure); a "sell" event is kept only if
// imbalance <= -minAbsImbalance (ask-heavy, confirming downside
// pressure). maxAge bounds how stale a looked-up snapshot may be before
// it's treated as "no L2 opinion available" - in that case the event is
// discarded rather than assumed to pass, since an unconfirmed signal
// should not silently behave like production (no L2 data) once this
// filter is applied.
func L2ImbalanceFilter(series *l2book.Series, minAbsImbalance float64, maxAge time.Duration) TrendFilter {
	return func(_ *marketstate.State, event evaluator.Event) bool {
		snap, ok := series.At(event.BucketStart, maxAge)
		if !ok {
			return false
		}

		switch event.Side {
		case "buy":
			return snap.Imbalance >= minAbsImbalance
		case "sell":
			return snap.Imbalance <= -minAbsImbalance
		default:
			return false
		}
	}
}
