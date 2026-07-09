// Command backfill downloads Bybit's free public historical trade archives
// for a symbol across a date range and writes real, production-identical
// candle history (1m/5m/15m, with buy/sell volume splits) to CSV files -
// the data foundation a real historical backtest needs, in place of the
// existing "last ~1,000 live trades" replay preview.
//
// Usage:
//
//	go run ./cmd/backfill -symbol BTCUSDT -from 2024-01-01 -to 2024-01-31 -out ./data/BTCUSDT
//
// Add -cache-dir to keep a local copy of each day's raw archive so re-runs
// (e.g. extending the date range) don't re-download days already fetched.
package main

import (
	"context"
	"encoding/csv"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"sentinelflow/engine/internal/historicaldata"
	"sentinelflow/engine/internal/marketstate"
)

const dateLayout = "2006-01-02"

func main() {
	symbol := flag.String("symbol", "", "market symbol, e.g. BTCUSDT (required)")
	fromFlag := flag.String("from", "", "start date, UTC, YYYY-MM-DD, inclusive (required)")
	toFlag := flag.String("to", "", "end date, UTC, YYYY-MM-DD, inclusive (required)")
	outDir := flag.String("out", "", "output directory for candle CSVs, one file per timeframe (required)")
	cacheDir := flag.String("cache-dir", "", "optional directory to cache raw daily archives, avoids re-downloading on repeat runs")
	flag.Parse()

	if *symbol == "" || *fromFlag == "" || *toFlag == "" || *outDir == "" {
		flag.Usage()
		log.Fatal("missing required flag: -symbol, -from, -to, and -out are all required")
	}

	from, err := time.Parse(dateLayout, *fromFlag)
	if err != nil {
		log.Fatalf("parse -from: %v", err)
	}

	to, err := time.Parse(dateLayout, *toFlag)
	if err != nil {
		log.Fatalf("parse -to: %v", err)
	}

	if to.Before(from) {
		log.Fatal("-to must not be before -from")
	}

	if err := run(*symbol, from, to, *outDir, *cacheDir); err != nil {
		log.Fatal(err)
	}
}

func run(symbol string, from time.Time, to time.Time, outDir string, cacheDir string) error {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return fmt.Errorf("create output dir: %w", err)
	}

	if cacheDir != "" {
		if err := os.MkdirAll(cacheDir, 0o755); err != nil {
			return fmt.Errorf("create cache dir: %w", err)
		}
	}

	writers, closeWriters, err := openCandleWriters(outDir)
	if err != nil {
		return err
	}
	defer closeWriters()

	client := historicaldata.NewClient()
	ctx := context.Background()

	replayer := historicaldata.NewReplayer(symbol, func(candle marketstate.Candle) {
		writer, ok := writers[candle.Timeframe]
		if !ok {
			return
		}
		if err := writeCandleRow(writer, candle); err != nil {
			log.Printf("WARN: write candle row: %v", err)
		}
	})

	totalTrades := 0
	totalDays := 0

	for day := from; !day.After(to); day = day.AddDate(0, 0, 1) {
		trades, err := fetchDay(ctx, client, symbol, day, cacheDir)
		if err != nil {
			log.Printf("WARN: %s: %v (skipping)", day.Format(dateLayout), err)
			continue
		}

		replayer.ReplayDay(trades)
		totalTrades += len(trades)
		totalDays++
		log.Printf("%s: %d trades replayed", day.Format(dateLayout), len(trades))
	}

	replayer.Flush()

	for _, writer := range writers {
		writer.Flush()
	}

	log.Printf(
		"done: %s, %d days, %d total trades replayed, candles written to %s",
		symbol, totalDays, totalTrades, outDir,
	)

	return nil
}

// fetchDay serves one day's trades from cacheDir when available, otherwise
// downloads and, if cacheDir is set, saves the raw archive for next time.
func fetchDay(
	ctx context.Context,
	client *historicaldata.Client,
	symbol string,
	day time.Time,
	cacheDir string,
) ([]marketstate.Trade, error) {
	cachePath := ""
	if cacheDir != "" {
		cachePath = filepath.Join(cacheDir, fmt.Sprintf("%s-%s.csv.gz", symbol, day.Format(dateLayout)))

		if body, err := os.ReadFile(cachePath); err == nil {
			return historicaldata.ParseDailyArchive(body, symbol)
		}
	}

	body, err := client.FetchDailyArchiveBytes(ctx, symbol, day)
	if err != nil {
		return nil, err
	}

	if body == nil {
		return nil, nil
	}

	if cachePath != "" {
		if err := os.WriteFile(cachePath, body, 0o644); err != nil {
			log.Printf("WARN: cache write failed for %s: %v", day.Format(dateLayout), err)
		}
	}

	return historicaldata.ParseDailyArchive(body, symbol)
}

func openCandleWriters(outDir string) (map[string]*csv.Writer, func(), error) {
	timeframes := []string{"1m", "5m", "15m"}
	writers := make(map[string]*csv.Writer, len(timeframes))
	files := make([]*os.File, 0, len(timeframes))

	closeAll := func() {
		for _, file := range files {
			_ = file.Close()
		}
	}

	for _, timeframe := range timeframes {
		path := filepath.Join(outDir, fmt.Sprintf("candles_%s.csv", timeframe))

		file, err := os.Create(path)
		if err != nil {
			closeAll()
			return nil, nil, fmt.Errorf("create candle file for %s: %w", timeframe, err)
		}
		files = append(files, file)

		writer := csv.NewWriter(file)
		if err := writer.Write([]string{
			"bucketStart", "open", "high", "low", "close", "buyVolume", "sellVolume", "totalVolume", "trades",
		}); err != nil {
			closeAll()
			return nil, nil, fmt.Errorf("write header for %s: %w", timeframe, err)
		}

		writers[timeframe] = writer
	}

	return writers, closeAll, nil
}

func writeCandleRow(writer *csv.Writer, candle marketstate.Candle) error {
	return writer.Write([]string{
		candle.BucketStart.UTC().Format(time.RFC3339),
		strconv.FormatFloat(candle.Open, 'f', -1, 64),
		strconv.FormatFloat(candle.High, 'f', -1, 64),
		strconv.FormatFloat(candle.Low, 'f', -1, 64),
		strconv.FormatFloat(candle.Close, 'f', -1, 64),
		strconv.FormatFloat(candle.BuyVolume, 'f', -1, 64),
		strconv.FormatFloat(candle.SellVolume, 'f', -1, 64),
		strconv.FormatFloat(candle.TotalVolume, 'f', -1, 64),
		strconv.FormatInt(candle.Trades, 10),
	})
}
