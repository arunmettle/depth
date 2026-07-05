package marketstate

import (
	"sort"
	"sync"
	"time"
)

var supportedTimeframes = []timeframeDefinition{
	{Label: "1m", Window: time.Minute},
	{Label: "5m", Window: 5 * time.Minute},
	{Label: "15m", Window: 15 * time.Minute},
}

type timeframeDefinition struct {
	Label  string
	Window time.Duration
}

type Trade struct {
	Price     float64
	Side      string
	Size      float64
	Symbol    string
	Timestamp time.Time
}

type Candle struct {
	BucketStart time.Time `json:"bucketStart"`
	BuyVolume   float64   `json:"buyVolume"`
	Close       float64   `json:"close"`
	High        float64   `json:"high"`
	Low         float64   `json:"low"`
	Open        float64   `json:"open"`
	SellVolume  float64   `json:"sellVolume"`
	Symbol      string    `json:"symbol"`
	Timeframe   string    `json:"timeframe"`
	TotalVolume float64   `json:"totalVolume"`
	Trades      int64     `json:"trades"`
}

type State struct {
	mu           sync.RWMutex
	candles      map[string]map[string]Candle
	history      map[string]map[string][]Candle
	historyLimit int
}

func New() *State {
	return &State{
		candles:      make(map[string]map[string]Candle),
		history:      make(map[string]map[string][]Candle),
		historyLimit: 20,
	}
}

func (s *State) UpdateTrade(trade Trade) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.candles[trade.Symbol]; !ok {
		s.candles[trade.Symbol] = make(map[string]Candle)
	}

	if _, ok := s.history[trade.Symbol]; !ok {
		s.history[trade.Symbol] = make(map[string][]Candle)
	}

	for _, timeframe := range supportedTimeframes {
		bucketStart := bucketStart(trade.Timestamp, timeframe.Window)
		current, ok := s.candles[trade.Symbol][timeframe.Label]

		if ok && !current.BucketStart.Equal(bucketStart) {
			s.appendHistory(trade.Symbol, timeframe.Label, current)
		}

		if !ok || !current.BucketStart.Equal(bucketStart) {
			current = Candle{
				BucketStart: bucketStart,
				Close:       trade.Price,
				High:        trade.Price,
				Low:         trade.Price,
				Open:        trade.Price,
				Symbol:      trade.Symbol,
				Timeframe:   timeframe.Label,
			}
		}

		if trade.Price > current.High {
			current.High = trade.Price
		}

		if trade.Price < current.Low {
			current.Low = trade.Price
		}

		current.Close = trade.Price
		current.TotalVolume += trade.Size
		current.Trades++

		if trade.Side == "Buy" {
			current.BuyVolume += trade.Size
		} else if trade.Side == "Sell" {
			current.SellVolume += trade.Size
		}

		s.candles[trade.Symbol][timeframe.Label] = current
	}
}

func (s *State) Snapshot() []Candle {
	s.mu.RLock()
	defer s.mu.RUnlock()

	items := make([]Candle, 0)
	for _, byTimeframe := range s.candles {
		for _, candle := range byTimeframe {
			items = append(items, candle)
		}
	}

	sort.Slice(items, func(left, right int) bool {
		if items[left].Symbol == items[right].Symbol {
			return items[left].Timeframe < items[right].Timeframe
		}

		return items[left].Symbol < items[right].Symbol
	})

	return items
}

func (s *State) CurrentCandle(symbol string, timeframe string) (Candle, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	byTimeframe, ok := s.candles[symbol]
	if !ok {
		return Candle{}, false
	}

	candle, ok := byTimeframe[timeframe]
	return candle, ok
}

func (s *State) RecentCandles(symbol string, timeframe string, limit int) []Candle {
	s.mu.RLock()
	defer s.mu.RUnlock()

	byTimeframe, ok := s.history[symbol]
	if !ok {
		return nil
	}

	candles := byTimeframe[timeframe]
	if len(candles) == 0 {
		return nil
	}

	if limit <= 0 || limit > len(candles) {
		limit = len(candles)
	}

	start := len(candles) - limit
	items := append([]Candle(nil), candles[start:]...)
	return items
}

func (s *State) appendHistory(symbol string, timeframe string, candle Candle) {
	items := append(s.history[symbol][timeframe], candle)
	if len(items) > s.historyLimit {
		items = append([]Candle(nil), items[len(items)-s.historyLimit:]...)
	}

	s.history[symbol][timeframe] = items
}

func bucketStart(timestamp time.Time, window time.Duration) time.Time {
	utc := timestamp.UTC()
	return utc.Truncate(window)
}
