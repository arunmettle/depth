package evaluator

import (
	"fmt"
	"math"
	"sync"
	"time"

	"sentinelflow/engine/internal/marketstate"
)

type Rule struct {
	ID               string
	MarketSymbol     string
	Name             string
	RuleType         string
	Status           string
	Timeframe        string
	StackedImbalance *StackedImbalanceParams
	TrappedTraders   *TrappedTradersParams
	UserID           string
}

type StackedImbalanceParams struct {
	ConfirmationRows    int
	ThresholdMultiplier float64
}

// TrappedTradersParams configures the failed-breakout reversal detector: one
// candle shows aggressive one-sided dominance (a "trap" candle), then the
// very next candle reverses hard enough to round-trip through the trap
// candle's opposite extreme with opposing dominance, meaning the traders who
// pushed the trap candle are now underwater and likely to get squeezed out.
type TrappedTradersParams struct {
	// MinAbsorptionVolume is the minimum notional (price * size) volume the
	// trap candle's dominant side must have moved for the reversal to
	// count as a real trapped-trader event rather than low-volume noise.
	MinAbsorptionVolume float64
	// TrapSide restricts which side's traders we're looking to catch
	// trapped: "buyers" (bearish reversal signal), "sellers" (bullish
	// reversal signal), or "both".
	TrapSide string
}

type Event struct {
	BucketStart time.Time `json:"bucketStart"`
	Message     string    `json:"message"`
	RuleID      string    `json:"ruleId"`
	RuleName    string    `json:"ruleName"`
	RuleType    string    `json:"ruleType"`
	Side        string    `json:"side"`
	Symbol      string    `json:"symbol"`
	Timeframe   string    `json:"timeframe"`
	TradePlan   TradePlan `json:"tradePlan"`
	UserID      string    `json:"userId,omitempty"`
}

type TradePlan struct {
	EntryPrice   float64 `json:"entryPrice"`
	RiskReward1  float64 `json:"riskReward1"`
	RiskReward2  float64 `json:"riskReward2"`
	SignalHigh   float64 `json:"signalHigh"`
	SignalLow    float64 `json:"signalLow"`
	StopLoss     float64 `json:"stopLoss"`
	TakeProfit1  float64 `json:"takeProfit1"`
	TakeProfit2  float64 `json:"takeProfit2"`
	TriggerPrice float64 `json:"triggerPrice"`
}

type Evaluator struct {
	state      *marketstate.State
	suppressor *Suppressor
}

type Suppressor struct {
	mu   sync.Mutex
	seen map[string]time.Time
}

func LaunchRules(symbols []string) []Rule {
	rules := make([]Rule, 0, len(symbols)*6)

	for _, symbol := range symbols {
		for _, timeframe := range []string{"1m", "5m", "15m"} {
			rules = append(rules, Rule{
				ID:           fmt.Sprintf("launch:%s:%s:stacked-imbalance", symbol, timeframe),
				MarketSymbol: symbol,
				Name:         fmt.Sprintf("%s %s stacked imbalance", symbol, timeframe),
				RuleType:     "stacked_imbalance",
				Status:       "active",
				Timeframe:    timeframe,
				StackedImbalance: &StackedImbalanceParams{
					ConfirmationRows:    3,
					ThresholdMultiplier: 300,
				},
			})

			rules = append(rules, Rule{
				ID:           fmt.Sprintf("launch:%s:%s:trapped-traders", symbol, timeframe),
				MarketSymbol: symbol,
				Name:         fmt.Sprintf("%s %s trapped traders", symbol, timeframe),
				RuleType:     "trapped_traders",
				Status:       "active",
				Timeframe:    timeframe,
				TrappedTraders: &TrappedTradersParams{
					MinAbsorptionVolume: 250000,
					TrapSide:            "both",
				},
			})
		}
	}

	return rules
}

func New(state *marketstate.State) *Evaluator {
	return &Evaluator{
		state:      state,
		suppressor: NewSuppressor(),
	}
}

func NewSuppressor() *Suppressor {
	return &Suppressor{
		seen: make(map[string]time.Time),
	}
}

func (e *Evaluator) Evaluate(rule Rule) (*Event, bool) {
	if rule.Status != "active" {
		return nil, false
	}

	switch rule.RuleType {
	case "stacked_imbalance":
		return e.evaluateStackedImbalance(rule)
	case "trapped_traders":
		return e.evaluateTrappedTraders(rule)
	default:
		return nil, false
	}
}

func (e *Evaluator) evaluateStackedImbalance(rule Rule) (*Event, bool) {
	if rule.StackedImbalance == nil {
		return nil, false
	}

	current, ok := e.state.CurrentCandle(rule.MarketSymbol, rule.Timeframe)
	if !ok {
		return nil, false
	}

	required := rule.StackedImbalance.ConfirmationRows
	if required <= 0 {
		return nil, false
	}

	recent := e.state.RecentCandles(rule.MarketSymbol, rule.Timeframe, required-1)
	window := append(recent, current)
	if len(window) < required {
		return nil, false
	}

	window = window[len(window)-required:]

	side, ok := detectStackedImbalance(window, rule.StackedImbalance.ThresholdMultiplier)
	if !ok {
		return nil, false
	}

	key := duplicateKey(rule.ID, current.BucketStart, side)
	if !e.suppressor.Allow(key, current.BucketStart) {
		return nil, false
	}

	tradePlan, ok := BuildTradePlan(window, side)
	if !ok {
		return nil, false
	}

	return &Event{
		BucketStart: current.BucketStart,
		Message: fmt.Sprintf(
			"%s %s %s stacked imbalance confirmed across %d candles at %.0f%% threshold. Entry %.2f, stop %.2f, TP1 %.2f, TP2 %.2f.",
			rule.MarketSymbol,
			rule.Timeframe,
			side,
			required,
			rule.StackedImbalance.ThresholdMultiplier,
			tradePlan.EntryPrice,
			tradePlan.StopLoss,
			tradePlan.TakeProfit1,
			tradePlan.TakeProfit2,
		),
		RuleID:    rule.ID,
		RuleName:  rule.Name,
		RuleType:  rule.RuleType,
		Side:      side,
		Symbol:    rule.MarketSymbol,
		Timeframe: rule.Timeframe,
		TradePlan: tradePlan,
		UserID:    rule.UserID,
	}, true
}

func (e *Evaluator) evaluateTrappedTraders(rule Rule) (*Event, bool) {
	if rule.TrappedTraders == nil {
		return nil, false
	}

	current, ok := e.state.CurrentCandle(rule.MarketSymbol, rule.Timeframe)
	if !ok {
		return nil, false
	}

	recent := e.state.RecentCandles(rule.MarketSymbol, rule.Timeframe, 1)
	if len(recent) < 1 {
		return nil, false
	}

	window := append(recent, current)

	side, ok := detectTrappedTraders(window, rule.TrappedTraders.MinAbsorptionVolume, rule.TrappedTraders.TrapSide)
	if !ok {
		return nil, false
	}

	key := duplicateKey(rule.ID, current.BucketStart, side)
	if !e.suppressor.Allow(key, current.BucketStart) {
		return nil, false
	}

	tradePlan, ok := BuildTradePlan(window, side)
	if !ok {
		return nil, false
	}

	trappedSide := "buyers"
	if side == "buy" {
		trappedSide = "sellers"
	}

	return &Event{
		BucketStart: current.BucketStart,
		Message: fmt.Sprintf(
			"%s %s trapped %s confirmed: failed breakout round-tripped through the prior candle on at least %.0f notional. Entry %.2f, stop %.2f, TP1 %.2f, TP2 %.2f.",
			rule.MarketSymbol,
			rule.Timeframe,
			trappedSide,
			rule.TrappedTraders.MinAbsorptionVolume,
			tradePlan.EntryPrice,
			tradePlan.StopLoss,
			tradePlan.TakeProfit1,
			tradePlan.TakeProfit2,
		),
		RuleID:    rule.ID,
		RuleName:  rule.Name,
		RuleType:  rule.RuleType,
		Side:      side,
		Symbol:    rule.MarketSymbol,
		Timeframe: rule.Timeframe,
		TradePlan: tradePlan,
		UserID:    rule.UserID,
	}, true
}

func detectStackedImbalance(candles []marketstate.Candle, thresholdMultiplier float64) (string, bool) {
	var expectedSide string

	for _, candle := range candles {
		side, ratio, ok := dominantSide(candle)
		if !ok {
			return "", false
		}

		if ratio*100 < thresholdMultiplier {
			return "", false
		}

		if expectedSide == "" {
			expectedSide = side
			continue
		}

		if expectedSide != side {
			return "", false
		}
	}

	if expectedSide == "" {
		return "", false
	}

	return expectedSide, true
}

func dominantSide(candle marketstate.Candle) (string, float64, bool) {
	switch {
	case candle.BuyVolume > candle.SellVolume:
		return "buy", imbalanceRatio(candle.BuyVolume, candle.SellVolume), true
	case candle.SellVolume > candle.BuyVolume:
		return "sell", imbalanceRatio(candle.SellVolume, candle.BuyVolume), true
	default:
		return "", 0, false
	}
}

// detectTrappedTraders looks for a two-candle failed-breakout reversal: the
// prior (older) candle shows dominant one-sided volume (the "trap" candle),
// and the current candle reverses with opposing dominance hard enough to
// close back through the trap candle's opposite extreme. That round trip
// means whoever bought (or sold) the trap candle is now underwater, so we
// signal the opposite direction expecting them to get squeezed out.
//
// candles must be exactly [prior, current] in chronological order.
func detectTrappedTraders(candles []marketstate.Candle, minAbsorptionVolume float64, trapSide string) (string, bool) {
	if len(candles) != 2 {
		return "", false
	}

	prior, current := candles[0], candles[1]

	priorSide, _, ok := dominantSide(prior)
	if !ok {
		return "", false
	}

	currentSide, _, ok := dominantSide(current)
	if !ok {
		return "", false
	}

	if priorSide == currentSide {
		return "", false
	}

	// Approximate notional (quote-currency) volume using the trap candle's
	// own close, since candles only track base-asset size, not notional.
	switch priorSide {
	case "buy":
		if trapSide == "sellers" {
			return "", false
		}
		if current.Close >= prior.Low {
			return "", false
		}
		if prior.BuyVolume*prior.Close < minAbsorptionVolume {
			return "", false
		}
		return "sell", true
	case "sell":
		if trapSide == "buyers" {
			return "", false
		}
		if current.Close <= prior.High {
			return "", false
		}
		if prior.SellVolume*prior.Close < minAbsorptionVolume {
			return "", false
		}
		return "buy", true
	default:
		return "", false
	}
}

func imbalanceRatio(dominant float64, opposing float64) float64 {
	if dominant <= 0 {
		return 0
	}

	if opposing <= 0 {
		return math.Inf(1)
	}

	return dominant / opposing
}

// BuildTradePlan derives entry/stop/target levels from a real confirmation
// candle window using the same conservative sizing the live evaluator uses,
// so callers such as the validation alert endpoint can produce a realistic
// trade plan instead of a fabricated one.
func BuildTradePlan(candles []marketstate.Candle, side string) (TradePlan, bool) {
	if len(candles) == 0 {
		return TradePlan{}, false
	}

	signalHigh := candles[0].High
	signalLow := candles[0].Low
	for _, candle := range candles[1:] {
		if candle.High > signalHigh {
			signalHigh = candle.High
		}
		if candle.Low < signalLow {
			signalLow = candle.Low
		}
	}

	entry := candles[len(candles)-1].Close
	floor := minimumRiskDistance(entry)
	switch side {
	case "buy":
		risk := entry - signalLow
		if risk < floor {
			risk = floor
		}

		return TradePlan{
			EntryPrice:   entry,
			RiskReward1:  1,
			RiskReward2:  2,
			SignalHigh:   signalHigh,
			SignalLow:    signalLow,
			StopLoss:     entry - risk,
			TakeProfit1:  entry + risk,
			TakeProfit2:  entry + (2 * risk),
			TriggerPrice: entry,
		}, true
	case "sell":
		risk := signalHigh - entry
		if risk < floor {
			risk = floor
		}

		return TradePlan{
			EntryPrice:   entry,
			RiskReward1:  1,
			RiskReward2:  2,
			SignalHigh:   signalHigh,
			SignalLow:    signalLow,
			StopLoss:     entry + risk,
			TakeProfit1:  entry - risk,
			TakeProfit2:  entry - (2 * risk),
			TriggerPrice: entry,
		}, true
	default:
		return TradePlan{}, false
	}
}

// minimumViableRiskPercent is the smallest stop distance (as a fraction of
// entry price) BuildTradePlan will ever use, applied unconditionally rather
// than only as a degenerate-case fallback. Real trading round-trips this
// order on Bybit cost roughly 0.11-0.15% of notional (taker fees plus
// slippage). A stop distance any tighter than that lets trading costs alone
// exceed 1R, turning an on-paper profitable signal into a guaranteed loser
// once fees and slippage are applied. 0.75% keeps costs to a modest slice of
// 1R with room to spare; see docs/PROFITABILITY_AFTER_COSTS.md for the
// analysis that motivated this floor.
const minimumViableRiskPercent = 0.0075

func minimumRiskDistance(entry float64) float64 {
	if entry <= 0 {
		return 1
	}

	return math.Max(entry*minimumViableRiskPercent, 1)
}

func duplicateKey(ruleID string, bucketStart time.Time, side string) string {
	return fmt.Sprintf("%s|%s|%s", ruleID, bucketStart.UTC().Format(time.RFC3339), side)
}

func (s *Suppressor) Allow(key string, bucketStart time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	for existingKey, existingBucket := range s.seen {
		if existingBucket.Before(bucketStart) {
			delete(s.seen, existingKey)
		}
	}

	if _, ok := s.seen[key]; ok {
		return false
	}

	s.seen[key] = bucketStart
	return true
}
