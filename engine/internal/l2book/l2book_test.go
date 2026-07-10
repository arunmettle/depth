package l2book

import (
	"strings"
	"testing"
	"time"
)

func TestParseCSV_ComputesTopOfBookImbalance(t *testing.T) {
	// Two 1-second buckets: first bucket ends up bid-heavy, second
	// ends up ask-heavy, so the resulting Series should show a positive
	// imbalance snapshot followed by a negative one.
	// Timestamps are staggered so each group of book updates is fully
	// applied before the row that crosses the next snapshot-interval
	// boundary is processed - avoiding flakiness from partially-applied
	// same-instant updates, which real (much higher-frequency) Tardis data
	// doesn't exhibit at a 1-second snapshot granularity.
	csv := "exchange,symbol,timestamp,local_timestamp,is_snapshot,side,price,amount\n" +
		"bybit,BTCUSDT,100000,100000,true,bid,100,10\n" +
		"bybit,BTCUSDT,200000,200000,true,ask,101,1\n" +
		"bybit,BTCUSDT,1100000,1100000,false,bid,100,10\n" + // crosses 1st boundary, bid-heavy
		"bybit,BTCUSDT,1200000,1200000,false,bid,100,1\n" +
		"bybit,BTCUSDT,1300000,1300000,false,ask,101,10\n" +
		"bybit,BTCUSDT,2200000,2200000,false,ask,101,10\n" // crosses 2nd boundary, ask-heavy

	series, err := ParseCSV(strings.NewReader(csv), BuildOptions{})
	if err != nil {
		t.Fatalf("ParseCSV: %v", err)
	}

	if series.Len() != 2 {
		t.Fatalf("expected 2 snapshots, got %d", series.Len())
	}

	first, ok := series.At(time.UnixMicro(1100000).UTC(), time.Second)
	if !ok {
		t.Fatalf("expected a snapshot at t=1.1s")
	}
	if first.Imbalance <= 0 {
		t.Errorf("expected first snapshot bid-heavy (positive imbalance), got %v", first.Imbalance)
	}

	second, ok := series.At(time.UnixMicro(2200000).UTC(), time.Second)
	if !ok {
		t.Fatalf("expected a snapshot at t=2.2s")
	}
	if second.Imbalance >= 0 {
		t.Errorf("expected second snapshot ask-heavy (negative imbalance), got %v", second.Imbalance)
	}
}

func TestSeries_At_TooStaleReturnsFalse(t *testing.T) {
	csv := "exchange,symbol,timestamp,local_timestamp,is_snapshot,side,price,amount\n" +
		"bybit,BTCUSDT,100000,100000,true,bid,100,10\n" +
		"bybit,BTCUSDT,200000,200000,true,ask,101,1\n" +
		"bybit,BTCUSDT,1100000,1100000,false,bid,100,10\n" // crosses boundary, records one snapshot

	series, err := ParseCSV(strings.NewReader(csv), BuildOptions{})
	if err != nil {
		t.Fatalf("ParseCSV: %v", err)
	}
	if series.Len() != 1 {
		t.Fatalf("expected 1 snapshot, got %d", series.Len())
	}

	_, ok := series.At(time.UnixMicro(1100000).UTC().Add(10*time.Second), time.Second)
	if ok {
		t.Errorf("expected stale lookup to return ok=false")
	}
}

func TestSeries_At_BeforeSeriesStartReturnsFalse(t *testing.T) {
	series := &Series{}
	_, ok := series.At(time.Now(), time.Minute)
	if ok {
		t.Errorf("expected empty series lookup to return ok=false")
	}
}
