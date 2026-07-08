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

// OrderBookLevel is a single resting price level on one side of the book.
type OrderBookLevel struct {
	Price float64 `json:"price"`
	Size  float64 `json:"size"`
}

// OrderBookSnapshot is a point-in-time read of the top levels of a symbol's
// order book, ready for display. Bids are sorted best (highest price) first;
// asks are sorted best (lowest price) first.
type OrderBookSnapshot struct {
	Symbol string           `json:"symbol"`
	Bids   []OrderBookLevel `json:"bids"`
	Asks   []OrderBookLevel `json:"asks"`
}

// orderBook holds the live resting size at each price level for one symbol,
// keyed by price. It is built from a Bybit v5 orderbook snapshot message and
// kept current with delta messages.
type orderBook struct {
	bids map[float64]float64
	asks map[float64]float64
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
	orderBooks   map[string]*orderBook
}

func New() *State {
	return &State{
		candles:      make(map[string]map[string]Candle),
		history:      make(map[string]map[string][]Candle),
		historyLimit: 20,
		orderBooks:   make(map[string]*orderBook),
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

// ApplyOrderBookSnapshot replaces the entire resting book for a symbol. Bybit
// sends a fresh snapshot on initial subscribe and whenever it needs the
// client to reset its local book (e.g. after a service restart).
func (s *State) ApplyOrderBookSnapshot(symbol string, bids []OrderBookLevel, asks []OrderBookLevel) {
	s.mu.Lock()
	defer s.mu.Unlock()

	book := &orderBook{
		bids: make(map[float64]float64, len(bids)),
		asks: make(map[float64]float64, len(asks)),
	}

	applyOrderBookLevels(book.bids, bids)
	applyOrderBookLevels(book.asks, asks)

	s.orderBooks[symbol] = book
}

// ApplyOrderBookDelta merges incremental changes into a symbol's resting
// book. A level with size 0 means that price has been fully filled or
// cancelled and should be removed.
func (s *State) ApplyOrderBookDelta(symbol string, bids []OrderBookLevel, asks []OrderBookLevel) {
	s.mu.Lock()
	defer s.mu.Unlock()

	book, ok := s.orderBooks[symbol]
	if !ok {
		book = &orderBook{bids: make(map[float64]float64), asks: make(map[float64]float64)}
		s.orderBooks[symbol] = book
	}

	applyOrderBookLevels(book.bids, bids)
	applyOrderBookLevels(book.asks, asks)
}

func applyOrderBookLevels(side map[float64]float64, levels []OrderBookLevel) {
	for _, level := range levels {
		if level.Size <= 0 {
			delete(side, level.Price)
			continue
		}

		side[level.Price] = level.Size
	}
}

// OrderBookLevels returns the top `depth` resting levels on each side of a
// symbol's book, ordered best-price-first. It reports false when no book has
// been received yet for the symbol.
func (s *State) OrderBookLevels(symbol string, depth int) (OrderBookSnapshot, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	book, ok := s.orderBooks[symbol]
	if !ok || (len(book.bids) == 0 && len(book.asks) == 0) {
		return OrderBookSnapshot{}, false
	}

	bids := sortedOrderBookLevels(book.bids, depth, true)
	asks := sortedOrderBookLevels(book.asks, depth, false)

	return OrderBookSnapshot{Symbol: symbol, Bids: bids, Asks: asks}, true
}

func sortedOrderBookLevels(side map[float64]float64, depth int, descending bool) []OrderBookLevel {
	levels := make([]OrderBookLevel, 0, len(side))
	for price, size := range side {
		levels = append(levels, OrderBookLevel{Price: price, Size: size})
	}

	sort.Slice(levels, func(left, right int) bool {
		if descending {
			return levels[left].Price > levels[right].Price
		}

		return levels[left].Price < levels[right].Price
	})

	if depth > 0 && len(levels) > depth {
		levels = levels[:depth]
	}

	return levels
}
