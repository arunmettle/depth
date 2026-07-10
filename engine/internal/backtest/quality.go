package backtest

import (
	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/marketstate"
)

// QualityScore breaks a fired signal down into the components the trapped-
// trader/imbalance quality-scoring framework calls for: how decisively the
// triggering candle displaced (body vs range), whether volume actually
// confirmed the move (vs a trailing average), and how liquid/clean the
// session was when it fired. This is research-only - never used by
// production evaluator - so we can validate whether filtering on it
// produces a real, walk-forward-stable edge before ever wiring it into a
// live rule.
type QualityScore struct {
	Displacement float64 // 0-1: |close-open| / (high-low) of the triggering candle
	VolumeRatio  float64 // triggering candle volume / trailing SMA(volumeLookback) volume
	Session      string  // "asia", "london", "ny", "overlap", "off"
	Total        float64 // 0-100 weighted composite
}

// sessionQualityWeight scores session liquidity quality on a 0-1 scale.
// London/NY overlap (12:00-16:00 UTC) is the most liquid, cleanest window;
// Asia session and off-hours tend to have thinner, choppier order flow.
func sessionOf(hourUTC int) (string, float64) {
	switch {
	case hourUTC >= 12 && hourUTC < 16:
		return "overlap", 1.0
	case hourUTC >= 7 && hourUTC < 12:
		return "london", 0.75
	case hourUTC >= 16 && hourUTC < 21:
		return "ny", 0.75
	case hourUTC >= 0 && hourUTC < 7:
		return "asia", 0.45
	default:
		return "off", 0.35
	}
}

// ComputeQualityScore scores a fired event using the replay state at the
// moment it fired. volumeLookback is how many prior closed candles (same
// timeframe) to average for the volume-confirmation ratio.
func ComputeQualityScore(state *marketstate.State, event evaluator.Event, volumeLookback int) (QualityScore, bool) {
	current, ok := state.CurrentCandle(event.Symbol, event.Timeframe)
	if !ok {
		return QualityScore{}, false
	}

	candleRange := current.High - current.Low
	displacement := 0.0
	if candleRange > 0 {
		body := current.Close - current.Open
		if body < 0 {
			body = -body
		}
		displacement = body / candleRange
	}

	volumeRatio := 1.0
	if volumeLookback > 0 {
		recent := state.RecentCandles(event.Symbol, event.Timeframe, volumeLookback)
		if len(recent) >= volumeLookback {
			sum := 0.0
			for _, candle := range recent {
				sum += candle.TotalVolume
			}
			avg := sum / float64(len(recent))
			if avg > 0 {
				volumeRatio = current.TotalVolume / avg
			}
		}
	}

	session, sessionWeight := sessionOf(current.BucketStart.UTC().Hour())

	// Weighted composite: displacement and volume confirmation matter most
	// (they're the direct evidence a real order-flow imbalance occurred),
	// session quality is a smaller but real modifier for how trustworthy
	// that evidence is.
	displacementScore := clamp01(displacement) * 45
	volumeScore := clamp01(volumeRatio/2) * 35 // volumeRatio of 2x+ maxes this out
	sessionScore := sessionWeight * 20

	return QualityScore{
		Displacement: displacement,
		VolumeRatio:  volumeRatio,
		Session:      session,
		Total:        displacementScore + volumeScore + sessionScore,
	}, true
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// QualityFilter builds a TrendFilter (reusing the same fired-event-filter
// shape) that discards any signal scoring below minScore.
func QualityFilter(minScore float64, volumeLookback int) TrendFilter {
	return func(state *marketstate.State, event evaluator.Event) bool {
		score, ok := ComputeQualityScore(state, event, volumeLookback)
		if !ok {
			return false
		}
		return score.Total >= minScore
	}
}

// ComposeFilters ANDs multiple TrendFilters together - a signal is kept
// only if every non-nil filter keeps it. Lets research variants combine,
// e.g., a session/trend filter with a quality-score filter, without Runner
// needing more than one filter slot.
func ComposeFilters(filters ...TrendFilter) TrendFilter {
	return func(state *marketstate.State, event evaluator.Event) bool {
		for _, filter := range filters {
			if filter == nil {
				continue
			}
			if !filter(state, event) {
				return false
			}
		}
		return true
	}
}
