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
	UserID           string
}

type StackedImbalanceParams struct {
	ConfirmationRows    int
	ThresholdMultiplier float64
}

type Event struct {
	BucketStart time.Time `json:"bucketStart"`
	Message     string    `json:"message"`
	RuleID      string    `json:"ruleId"`
	RuleName    string    `json:"ruleName"`
	Side        string    `json:"side"`
	Symbol      string    `json:"symbol"`
	Timeframe   string    `json:"timeframe"`
	UserID      string    `json:"userId,omitempty"`
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
	rules := make([]Rule, 0, len(symbols)*3)

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
	if rule.Status != "active" || rule.RuleType != "stacked_imbalance" || rule.StackedImbalance == nil {
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

	return &Event{
		BucketStart: current.BucketStart,
		Message: fmt.Sprintf(
			"%s %s %s stacked imbalance confirmed across %d candles at %.0f%% threshold.",
			rule.MarketSymbol,
			rule.Timeframe,
			side,
			required,
			rule.StackedImbalance.ThresholdMultiplier,
		),
		RuleID:    rule.ID,
		RuleName:  rule.Name,
		Side:      side,
		Symbol:    rule.MarketSymbol,
		Timeframe: rule.Timeframe,
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

func imbalanceRatio(dominant float64, opposing float64) float64 {
	if dominant <= 0 {
		return 0
	}

	if opposing <= 0 {
		return math.Inf(1)
	}

	return dominant / opposing
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
