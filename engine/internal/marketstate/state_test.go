package marketstate

import (
	"testing"
	"time"
)

func TestUpdateTradeBuildsCandlesForSupportedTimeframes(t *testing.T) {
	state := New()
	tradeTime := time.Date(2026, 7, 5, 6, 7, 23, 0, time.UTC)

	state.UpdateTrade(Trade{
		Price:     104000.5,
		Side:      "Buy",
		Size:      0.25,
		Symbol:    "BTCUSDT",
		Timestamp: tradeTime,
	})

	snapshot := state.Snapshot()
	if len(snapshot) != 3 {
		t.Fatalf("expected 3 candles, got %d", len(snapshot))
	}

	buckets := make(map[string]time.Time, len(snapshot))
	for _, candle := range snapshot {
		buckets[candle.Timeframe] = candle.BucketStart
	}

	if buckets["15m"] != time.Date(2026, 7, 5, 6, 0, 0, 0, time.UTC) {
		t.Fatalf("unexpected 15m bucket start: %s", buckets["15m"])
	}

	if buckets["5m"] != time.Date(2026, 7, 5, 6, 5, 0, 0, time.UTC) {
		t.Fatalf("unexpected 5m bucket start: %s", buckets["5m"])
	}

	if buckets["1m"] != time.Date(2026, 7, 5, 6, 7, 0, 0, time.UTC) {
		t.Fatalf("unexpected 1m bucket start: %s", buckets["1m"])
	}
}

func TestUpdateTradeAccumulatesCurrentCandle(t *testing.T) {
	state := New()
	tradeTime := time.Date(2026, 7, 5, 6, 7, 23, 0, time.UTC)

	state.UpdateTrade(Trade{
		Price:     104000,
		Side:      "Buy",
		Size:      0.2,
		Symbol:    "BTCUSDT",
		Timestamp: tradeTime,
	})
	state.UpdateTrade(Trade{
		Price:     104120,
		Side:      "Sell",
		Size:      0.35,
		Symbol:    "BTCUSDT",
		Timestamp: tradeTime.Add(20 * time.Second),
	})

	var oneMinute Candle
	for _, candle := range state.Snapshot() {
		if candle.Symbol == "BTCUSDT" && candle.Timeframe == "1m" {
			oneMinute = candle
		}
	}

	if oneMinute.Open != 104000 {
		t.Fatalf("unexpected open: %f", oneMinute.Open)
	}

	if oneMinute.Close != 104120 {
		t.Fatalf("unexpected close: %f", oneMinute.Close)
	}

	if oneMinute.High != 104120 {
		t.Fatalf("unexpected high: %f", oneMinute.High)
	}

	if oneMinute.Low != 104000 {
		t.Fatalf("unexpected low: %f", oneMinute.Low)
	}

	if oneMinute.TotalVolume != 0.55 {
		t.Fatalf("unexpected total volume: %f", oneMinute.TotalVolume)
	}

	if oneMinute.BuyVolume != 0.2 {
		t.Fatalf("unexpected buy volume: %f", oneMinute.BuyVolume)
	}

	if oneMinute.SellVolume != 0.35 {
		t.Fatalf("unexpected sell volume: %f", oneMinute.SellVolume)
	}

	if oneMinute.Trades != 2 {
		t.Fatalf("unexpected trade count: %d", oneMinute.Trades)
	}
}

func TestUpdateTradeRollsIntoNewBucket(t *testing.T) {
	state := New()
	first := time.Date(2026, 7, 5, 6, 7, 50, 0, time.UTC)
	second := time.Date(2026, 7, 5, 6, 8, 5, 0, time.UTC)

	state.UpdateTrade(Trade{
		Price:     104000,
		Side:      "Buy",
		Size:      0.2,
		Symbol:    "BTCUSDT",
		Timestamp: first,
	})
	state.UpdateTrade(Trade{
		Price:     104050,
		Side:      "Buy",
		Size:      0.1,
		Symbol:    "BTCUSDT",
		Timestamp: second,
	})

	var oneMinute Candle
	for _, candle := range state.Snapshot() {
		if candle.Symbol == "BTCUSDT" && candle.Timeframe == "1m" {
			oneMinute = candle
		}
	}

	if !oneMinute.BucketStart.Equal(time.Date(2026, 7, 5, 6, 8, 0, 0, time.UTC)) {
		t.Fatalf("unexpected bucket start after rollover: %s", oneMinute.BucketStart)
	}

	if oneMinute.Open != 104050 || oneMinute.Close != 104050 {
		t.Fatalf("expected new candle to reset open/close, got open=%f close=%f", oneMinute.Open, oneMinute.Close)
	}
}

func TestUpdateTradeArchivesPreviousCandleOnBucketRollover(t *testing.T) {
	state := New()
	first := time.Date(2026, 7, 5, 6, 7, 10, 0, time.UTC)
	second := time.Date(2026, 7, 5, 6, 8, 2, 0, time.UTC)

	state.UpdateTrade(Trade{
		Price:     104000,
		Side:      "Buy",
		Size:      0.4,
		Symbol:    "BTCUSDT",
		Timestamp: first,
	})
	state.UpdateTrade(Trade{
		Price:     104040,
		Side:      "Sell",
		Size:      0.15,
		Symbol:    "BTCUSDT",
		Timestamp: second,
	})

	current, ok := state.CurrentCandle("BTCUSDT", "1m")
	if !ok {
		t.Fatalf("expected current 1m candle to exist")
	}

	if !current.BucketStart.Equal(time.Date(2026, 7, 5, 6, 8, 0, 0, time.UTC)) {
		t.Fatalf("unexpected current candle bucket: %s", current.BucketStart)
	}

	history := state.RecentCandles("BTCUSDT", "1m", 10)
	if len(history) != 1 {
		t.Fatalf("expected 1 archived candle, got %d", len(history))
	}

	if !history[0].BucketStart.Equal(time.Date(2026, 7, 5, 6, 7, 0, 0, time.UTC)) {
		t.Fatalf("unexpected archived candle bucket: %s", history[0].BucketStart)
	}

	if history[0].Open != 104000 || history[0].Close != 104000 {
		t.Fatalf("unexpected archived candle prices: open=%f close=%f", history[0].Open, history[0].Close)
	}
}

func TestRecentCandlesKeepsOnlyTheMostRecentHistoryWindow(t *testing.T) {
	state := New()
	start := time.Date(2026, 7, 5, 6, 0, 0, 0, time.UTC)

	for minute := 0; minute < 22; minute++ {
		state.UpdateTrade(Trade{
			Price:     104000 + float64(minute),
			Side:      "Buy",
			Size:      0.1,
			Symbol:    "BTCUSDT",
			Timestamp: start.Add(time.Duration(minute) * time.Minute),
		})
	}

	history := state.RecentCandles("BTCUSDT", "1m", 25)
	if len(history) != 20 {
		t.Fatalf("expected history to be capped at 20 candles, got %d", len(history))
	}

	if !history[0].BucketStart.Equal(start.Add(1 * time.Minute)) {
		t.Fatalf("unexpected oldest retained candle: %s", history[0].BucketStart)
	}

	if !history[len(history)-1].BucketStart.Equal(start.Add(20 * time.Minute)) {
		t.Fatalf("unexpected newest retained candle: %s", history[len(history)-1].BucketStart)
	}
}

func TestOrderBookLevelsReportsMissingBookAsNotReady(t *testing.T) {
	state := New()

	_, ok := state.OrderBookLevels("BTCUSDT", 5)
	if ok {
		t.Fatal("expected no order book to be reported before any snapshot is applied")
	}
}

func TestApplyOrderBookSnapshotSortsAndLimitsDepth(t *testing.T) {
	state := New()

	state.ApplyOrderBookSnapshot("BTCUSDT", []OrderBookLevel{
		{Price: 104000, Size: 1.5},
		{Price: 104010, Size: 2.5},
		{Price: 103990, Size: 0.5},
	}, []OrderBookLevel{
		{Price: 104030, Size: 1.0},
		{Price: 104020, Size: 3.0},
		{Price: 104040, Size: 0.75},
	})

	snapshot, ok := state.OrderBookLevels("BTCUSDT", 2)
	if !ok {
		t.Fatal("expected order book snapshot to be available")
	}

	if len(snapshot.Bids) != 2 || snapshot.Bids[0].Price != 104010 || snapshot.Bids[1].Price != 104000 {
		t.Fatalf("expected top 2 bids sorted by price descending, got %+v", snapshot.Bids)
	}

	if len(snapshot.Asks) != 2 || snapshot.Asks[0].Price != 104020 || snapshot.Asks[1].Price != 104030 {
		t.Fatalf("expected top 2 asks sorted by price ascending, got %+v", snapshot.Asks)
	}
}

func TestApplyOrderBookDeltaUpdatesAndRemovesLevels(t *testing.T) {
	state := New()

	state.ApplyOrderBookSnapshot("BTCUSDT", []OrderBookLevel{
		{Price: 104000, Size: 1.5},
		{Price: 103990, Size: 0.5},
	}, []OrderBookLevel{
		{Price: 104010, Size: 1.0},
	})

	state.ApplyOrderBookDelta("BTCUSDT", []OrderBookLevel{
		{Price: 104000, Size: 0}, // removed
		{Price: 103980, Size: 2.0}, // new level
	}, []OrderBookLevel{
		{Price: 104010, Size: 4.5}, // updated size
	})

	snapshot, ok := state.OrderBookLevels("BTCUSDT", 10)
	if !ok {
		t.Fatal("expected order book snapshot to be available")
	}

	if len(snapshot.Bids) != 2 {
		t.Fatalf("expected 2 remaining bid levels, got %+v", snapshot.Bids)
	}

	if snapshot.Bids[0].Price != 103990 || snapshot.Bids[1].Price != 103980 {
		t.Fatalf("unexpected bid levels after delta: %+v", snapshot.Bids)
	}

	if len(snapshot.Asks) != 1 || snapshot.Asks[0].Size != 4.5 {
		t.Fatalf("expected updated ask size, got %+v", snapshot.Asks)
	}
}

func TestApplyOrderBookDeltaBeforeSnapshotStillBuildsBook(t *testing.T) {
	state := New()

	state.ApplyOrderBookDelta("BTCUSDT", []OrderBookLevel{{Price: 104000, Size: 1.0}}, nil)

	snapshot, ok := state.OrderBookLevels("BTCUSDT", 10)
	if !ok {
		t.Fatal("expected order book to exist after delta-only updates")
	}

	if len(snapshot.Bids) != 1 || snapshot.Bids[0].Price != 104000 {
		t.Fatalf("unexpected bids from delta-only book: %+v", snapshot.Bids)
	}
}
