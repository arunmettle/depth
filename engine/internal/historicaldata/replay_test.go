package historicaldata

import (
	"testing"
	"time"

	"sentinelflow/engine/internal/marketstate"
)

func trade(symbol string, side string, price float64, size float64, at time.Time) marketstate.Trade {
	return marketstate.Trade{
		Price:     price,
		Side:      side,
		Size:      size,
		Symbol:    symbol,
		Timestamp: at,
	}
}

func TestBuildCandlesAggregatesBuyAndSellVolumeMatchingLiveBucketing(t *testing.T) {
	base := time.Date(2024, time.January, 1, 0, 0, 0, 0, time.UTC)

	trades := []marketstate.Trade{
		trade("BTCUSDT", "Buy", 100, 1, base),
		trade("BTCUSDT", "Sell", 101, 2, base.Add(10*time.Second)),
		trade("BTCUSDT", "Buy", 99, 1, base.Add(50*time.Second)),
		// next 1m bucket
		trade("BTCUSDT", "Buy", 105, 3, base.Add(90*time.Second)),
	}

	candles := BuildCandles("BTCUSDT", trades)

	oneMinute := candles["1m"]
	if len(oneMinute) != 2 {
		t.Fatalf("expected 2 one-minute candles (1 closed + 1 flushed open), got %d: %+v", len(oneMinute), oneMinute)
	}

	first := oneMinute[0]
	if first.Open != 100 || first.Close != 99 || first.High != 101 || first.Low != 99 {
		t.Fatalf("unexpected OHLC for first candle: %+v", first)
	}
	if first.BuyVolume != 2 || first.SellVolume != 2 {
		t.Fatalf("unexpected buy/sell volume split: %+v", first)
	}
	if first.Trades != 3 {
		t.Fatalf("expected 3 trades in first candle, got %d", first.Trades)
	}

	second := oneMinute[1]
	if second.Open != 105 || second.BuyVolume != 3 || second.SellVolume != 0 {
		t.Fatalf("unexpected second (flushed) candle: %+v", second)
	}
}

func TestReplayerCarriesStateAcrossMultipleReplayDayCalls(t *testing.T) {
	base := time.Date(2024, time.January, 1, 23, 59, 0, 0, time.UTC)

	var closed []marketstate.Candle
	replayer := NewReplayer("ETHUSDT", func(candle marketstate.Candle) {
		closed = append(closed, candle)
	})

	// "Day 1" trade near the end of the day.
	replayer.ReplayDay([]marketstate.Trade{
		trade("ETHUSDT", "Buy", 3000, 1, base),
	})

	// "Day 2" trade in the very next 1m bucket - simulates a day boundary
	// without resetting any bucketing state, exactly like continuous live
	// streaming would behave.
	replayer.ReplayDay([]marketstate.Trade{
		trade("ETHUSDT", "Sell", 2990, 2, base.Add(time.Minute)),
	})

	replayer.Flush()

	oneMinuteCount := 0
	for _, candle := range closed {
		if candle.Timeframe == "1m" {
			oneMinuteCount++
		}
	}

	if oneMinuteCount != 2 {
		t.Fatalf("expected 2 one-minute candles across the two ReplayDay calls, got %d: %+v", oneMinuteCount, closed)
	}
}

func TestBuildCandlesReturnsEmptyMapForNoTrades(t *testing.T) {
	candles := BuildCandles("BTCUSDT", nil)

	if len(candles) != 0 {
		t.Fatalf("expected no candles for empty trade input, got %+v", candles)
	}
}
