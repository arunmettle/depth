// Package l2book reconstructs a Bybit order book from Tardis.dev's
// incremental_book_L2 historical CSV datasets
// (https://docs.tardis.dev/downloadable-csv-files/data-types#incremental_book_l2)
// and derives a time series of top-of-book imbalance, so it can be tested
// as a confirming filter on top of the existing trade-tape-only rules
// (stacked_imbalance, trapped_traders).
//
// This package is research-only. The live engine and cmd/backtest's
// published results never depend on it - see
// engine/internal/backtest/l2filter.go for how a Series is turned into an
// optional backtest.TrendFilter, and VISUAL_PROOF_AND_BACKTEST_GOALS.md /
// the goal4-orderbook-data todo for why: trade-tape-only signals were
// walk-forward validated to have no robust edge, and real L2 depth data is
// the most likely lever to unlock one, but it is not yet proven.
//
// Tardis timestamps are microseconds since the Unix epoch (not
// nanoseconds) - this tripped up the first prototype of this analysis and
// is called out explicitly here to prevent that mistake recurring.
package l2book

import (
	"bufio"
	"compress/gzip"
	"encoding/csv"
	"fmt"
	"io"
	"sort"
	"strconv"
	"time"
)

// Snapshot is one point-in-time read of top-of-book imbalance.
type Snapshot struct {
	Timestamp time.Time
	// Imbalance is (bidVolume-askVolume)/(bidVolume+askVolume) across the
	// top Depth price levels on each side, in [-1, 1]. Positive means more
	// resting buy-side depth (bullish pressure), negative means more
	// resting sell-side depth (bearish pressure).
	Imbalance float64
	MidPrice  float64
}

// Series is an ascending-by-time list of Snapshots with a fast
// nearest-at-or-before lookup, so a backtest signal fired at an arbitrary
// timestamp can be matched to the most recent book state.
type Series struct {
	snapshots []Snapshot
}

// At returns the most recent Snapshot at or before t, provided it is no
// staler than maxAge. ok is false if there is no such snapshot (t before
// the series starts, or the nearest one is too stale) - callers should
// treat that as "no L2 opinion" rather than a false signal.
func (s *Series) At(t time.Time, maxAge time.Duration) (Snapshot, bool) {
	if len(s.snapshots) == 0 {
		return Snapshot{}, false
	}

	idx := sort.Search(len(s.snapshots), func(i int) bool {
		return s.snapshots[i].Timestamp.After(t)
	})
	if idx == 0 {
		return Snapshot{}, false
	}

	snap := s.snapshots[idx-1]
	if t.Sub(snap.Timestamp) > maxAge {
		return Snapshot{}, false
	}

	return snap, true
}

// Len returns the number of snapshots in the series.
func (s *Series) Len() int { return len(s.snapshots) }

// BuildOptions configures how a raw L2 update stream is turned into an
// imbalance Series.
type BuildOptions struct {
	// Depth is how many price levels on each side are summed into the
	// imbalance calculation. Tardis top-of-book research conventionally
	// uses the top 10 levels; 0 defaults to 10.
	Depth int
	// SnapshotInterval is how often a Snapshot is recorded as updates are
	// replayed. 0 defaults to 1 second - matching the horizon range
	// (5s-300s) the imbalance/forward-return prototype validated.
	SnapshotInterval time.Duration
}

func (o BuildOptions) withDefaults() BuildOptions {
	if o.Depth <= 0 {
		o.Depth = 10
	}
	if o.SnapshotInterval <= 0 {
		o.SnapshotInterval = time.Second
	}
	return o
}

// ParseGzipCSV gunzips and parses one Tardis incremental_book_L2 CSV file
// (the format downloadable from
// https://datasets.tardis.dev/v1/bybit/incremental_book_L2/...) into an
// imbalance Series.
func ParseGzipCSV(r io.Reader, opts BuildOptions) (*Series, error) {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return nil, fmt.Errorf("open gzip L2 archive: %w", err)
	}
	defer gz.Close()

	return ParseCSV(gz, opts)
}

// ParseCSV parses Tardis's incremental_book_L2 CSV format:
//
//	exchange,symbol,timestamp,local_timestamp,is_snapshot,side,price,amount
//
// timestamp is microseconds since the Unix epoch. amount of 0 removes that
// price level from the book (Tardis's convention for a deletion).
func ParseCSV(r io.Reader, opts BuildOptions) (*Series, error) {
	opts = opts.withDefaults()

	reader := csv.NewReader(bufio.NewReaderSize(r, 1024*1024))
	reader.ReuseRecord = true

	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("read L2 CSV header: %w", err)
	}
	if len(header) < 8 {
		return nil, fmt.Errorf("unexpected L2 CSV header shape: %v", header)
	}

	bids := make(map[float64]float64)
	asks := make(map[float64]float64)

	var snapshots []Snapshot
	var nextSnapAt int64 // microseconds
	intervalMicros := opts.SnapshotInterval.Microseconds()

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read L2 CSV row: %w", err)
		}

		tsMicros, err := strconv.ParseInt(record[2], 10, 64)
		if err != nil {
			continue
		}
		side := record[5]
		price, err := strconv.ParseFloat(record[6], 64)
		if err != nil {
			continue
		}
		amount, err := strconv.ParseFloat(record[7], 64)
		if err != nil {
			continue
		}

		book := bids
		if side == "ask" {
			book = asks
		}
		if amount == 0 {
			delete(book, price)
		} else {
			book[price] = amount
		}

		if nextSnapAt == 0 {
			nextSnapAt = tsMicros + intervalMicros
		}

		if tsMicros >= nextSnapAt {
			if snap, ok := topOfBookImbalance(bids, asks, opts.Depth, tsMicros); ok {
				snapshots = append(snapshots, snap)
			}
			nextSnapAt = tsMicros + intervalMicros
		}
	}

	return &Series{snapshots: snapshots}, nil
}

func topOfBookImbalance(bids, asks map[float64]float64, depth int, tsMicros int64) (Snapshot, bool) {
	if len(bids) == 0 || len(asks) == 0 {
		return Snapshot{}, false
	}

	bidPrices := make([]float64, 0, len(bids))
	for p := range bids {
		bidPrices = append(bidPrices, p)
	}
	sort.Sort(sort.Reverse(sort.Float64Slice(bidPrices)))

	askPrices := make([]float64, 0, len(asks))
	for p := range asks {
		askPrices = append(askPrices, p)
	}
	sort.Float64s(askPrices)

	bestBid := bidPrices[0]
	bestAsk := askPrices[0]
	if bestBid >= bestAsk {
		// Crossed/locked book mid-update - skip, matches prototype behavior.
		return Snapshot{}, false
	}

	var bidVol, askVol float64
	for i := 0; i < depth && i < len(bidPrices); i++ {
		bidVol += bids[bidPrices[i]]
	}
	for i := 0; i < depth && i < len(askPrices); i++ {
		askVol += asks[askPrices[i]]
	}
	if bidVol+askVol == 0 {
		return Snapshot{}, false
	}

	return Snapshot{
		Timestamp: time.UnixMicro(tsMicros).UTC(),
		Imbalance: (bidVol - askVol) / (bidVol + askVol),
		MidPrice:  (bestBid + bestAsk) / 2,
	}, true
}
