package backtest

import "sentinelflow/engine/internal/outcome"

// realisticRoundTripCostPercent mirrors
// web/lib/history/trading-costs.ts:REALISTIC_ROUND_TRIP_COST_PERCENT.
// Kept as a separate Go constant (cross-language duplication is
// unavoidable without a shared config file) - if the web constant ever
// changes, update this one too so backtest and live track-record numbers
// stay comparable.
const realisticRoundTripCostPercent = 0.15

// Summary aggregates a set of resolved Signals into the same headline
// numbers the web Track Record card shows for live alerts, so a backtest
// result can be compared apples-to-apples with real performance.
type Summary struct {
	TotalSignals int
	Resolved     int
	Wins         int
	Losses       int
	Expired      int
	Pending      int

	WinRate     float64 // wins / (wins+losses), 0 when no decided trades
	GrossAvgR   float64
	NetAvgR     float64
	GrossTotalR float64
	NetTotalR   float64
}

// Summarize computes headline stats across signals. Only resolved,
// decided signals (stop/TP1/TP2 hit) count toward win rate and average R;
// expired and still-pending signals are reported separately rather than
// silently excluded, since they matter for judging whether the backtest
// window was long enough for signals to actually play out.
func Summarize(signals []Signal) Summary {
	summary := Summary{TotalSignals: len(signals)}

	for _, signal := range signals {
		switch signal.Outcome.Status {
		case outcome.StatusStopHit:
			summary.Resolved++
			summary.Losses++
		case outcome.StatusTP1Hit, outcome.StatusTP2Hit:
			summary.Resolved++
			summary.Wins++
		case outcome.StatusExpired:
			summary.Expired++
			continue
		default:
			summary.Pending++
			continue
		}

		grossR := signal.Outcome.RMultiple
		netR := netRMultiple(signal, grossR)

		summary.GrossTotalR += grossR
		summary.NetTotalR += netR
	}

	decided := summary.Wins + summary.Losses
	if decided > 0 {
		summary.WinRate = float64(summary.Wins) / float64(decided)
		summary.GrossAvgR = summary.GrossTotalR / float64(decided)
		summary.NetAvgR = summary.NetTotalR / float64(decided)
	}

	return summary
}

// netRMultiple mirrors web/lib/history/trading-costs.ts:computeNetRMultiple -
// sizing the realistic round-trip cost in R terms using the signal's own
// entry/stop distance, then subtracting it from the gross R-multiple.
func netRMultiple(signal Signal, grossR float64) float64 {
	entry := signal.Event.TradePlan.EntryPrice
	stop := signal.Event.TradePlan.StopLoss

	riskDistance := entry - stop
	if riskDistance < 0 {
		riskDistance = -riskDistance
	}
	if riskDistance == 0 {
		return grossR
	}

	costInR := (realisticRoundTripCostPercent / 100) * entry / riskDistance

	return grossR - costInR
}
