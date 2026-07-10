// Command backtest-sweep loads one window of real historical trades once
// (via the same cache as cmd/backtest) and then replays it through many
// stacked_imbalance / trapped_traders rule configurations, to search for a
// configuration with a genuine edge before publishing it on the public
// /backtest page. This is a research/tuning tool, not part of the shipped
// product - it does not write to Supabase.
//
// Usage:
//
//	go run ./cmd/backtest-sweep -symbol BTCUSDT -from 2024-01-01 -to 2024-01-14 -cache-dir ../_bt_cache
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"time"

	"sentinelflow/engine/internal/backtest"
	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/historicaldata"
	"sentinelflow/engine/internal/marketstate"
)

const dateLayout = "2006-01-02"

type result struct {
	label   string
	summary backtest.Summary
}

func main() {
	symbol := flag.String("symbol", "", "market symbol, e.g. BTCUSDT (required)")
	fromFlag := flag.String("from", "", "start date, UTC, YYYY-MM-DD, inclusive (required)")
	toFlag := flag.String("to", "", "end date, UTC, YYYY-MM-DD, inclusive (required)")
	cacheDir := flag.String("cache-dir", "", "optional directory to cache raw daily archives, shared with cmd/backfill and cmd/backtest")
	minResolved := flag.Int("min-resolved", 30, "minimum resolved signals required to report a configuration")
	flag.Parse()

	if *symbol == "" || *fromFlag == "" || *toFlag == "" {
		flag.Usage()
		log.Fatal("missing required flag: -symbol, -from, and -to are all required")
	}

	from, err := time.Parse(dateLayout, *fromFlag)
	if err != nil {
		log.Fatalf("parse -from: %v", err)
	}
	to, err := time.Parse(dateLayout, *toFlag)
	if err != nil {
		log.Fatalf("parse -to: %v", err)
	}

	if *cacheDir != "" {
		if err := os.MkdirAll(*cacheDir, 0o755); err != nil {
			log.Fatalf("create cache dir: %v", err)
		}
	}

	ctx := context.Background()
	client := historicaldata.NewClient()

	log.Printf("loading %s trades %s -> %s into memory once...", *symbol, *fromFlag, *toFlag)
	daysTrades := make([][]marketstate.Trade, 0)
	totalTrades := 0
	for day := from; !day.After(to); day = day.AddDate(0, 0, 1) {
		trades, err := fetchDay(ctx, client, *symbol, day, *cacheDir)
		if err != nil {
			log.Printf("WARN: %s: %v (skipping)", day.Format(dateLayout), err)
			continue
		}
		daysTrades = append(daysTrades, trades)
		totalTrades += len(trades)
		log.Printf("%s: %d trades loaded", day.Format(dateLayout), len(trades))
	}
	log.Printf("loaded %d total trades across %d days into memory", totalTrades, len(daysTrades))

	var results []result

	// stacked_imbalance sweep: vary timeframe, confirmation rows, and
	// threshold multiplier to look for fewer/higher-quality signals than
	// the shipped default (3 rows / 300%).
	for _, tf := range []string{"1m", "5m", "15m"} {
		for _, rows := range []int{2, 3, 4, 5} {
			for _, threshold := range []float64{300, 400, 500, 600, 800} {
				rule := evaluator.Rule{
					ID:           fmt.Sprintf("sweep:%s:%s:si:%d:%.0f", *symbol, tf, rows, threshold),
					MarketSymbol: *symbol,
					Name:         "sweep",
					RuleType:     "stacked_imbalance",
					Status:       "active",
					Timeframe:    tf,
					StackedImbalance: &evaluator.StackedImbalanceParams{
						ConfirmationRows:    rows,
						ThresholdMultiplier: threshold,
					},
				}
				summary := replay(rule, daysTrades)
				results = append(results, result{
					label:   fmt.Sprintf("stacked_imbalance tf=%-3s rows=%d threshold=%.0f%%", tf, rows, threshold),
					summary: summary,
				})
			}
		}
	}

	// trapped_traders sweep: vary timeframe, minimum absorption volume, and trap side.
	for _, tf := range []string{"1m", "5m", "15m"} {
		for _, minVol := range []float64{100000, 250000, 500000, 1000000, 2000000} {
			for _, side := range []string{"both", "buyers", "sellers"} {
				rule := evaluator.Rule{
					ID:           fmt.Sprintf("sweep:%s:%s:tt:%.0f:%s", *symbol, tf, minVol, side),
					MarketSymbol: *symbol,
					Name:         "sweep",
					RuleType:     "trapped_traders",
					Status:       "active",
					Timeframe:    tf,
					TrappedTraders: &evaluator.TrappedTradersParams{
						MinAbsorptionVolume: minVol,
						TrapSide:            side,
					},
				}
				summary := replay(rule, daysTrades)
				results = append(results, result{
					label:   fmt.Sprintf("trapped_traders  tf=%-3s minVol=%.0f side=%-7s", tf, minVol, side),
					summary: summary,
				})
			}
		}
	}

	// Logic-variant sweep: for the base configs shown to have the most gross
	// edge in round 1 (trapped_traders buyers-only, and low-threshold
	// stacked_imbalance), test whether a TP2-only exit (let winners run to
	// 2R instead of banking a capped 1R win) and/or a simple SMA trend
	// filter turns a real-but-cost-losing gross edge into a net-positive
	// one, instead of only tuning the existing knobs.
	type baseConfig struct {
		label string
		rule  func() evaluator.Rule
	}
	baseConfigs := []baseConfig{
		{
			label: "trapped_traders tf=15m minVol=250000 side=buyers",
			rule: func() evaluator.Rule {
				return evaluator.Rule{
					ID: "sweep:variant:tt:15m:buyers", MarketSymbol: *symbol, Name: "sweep",
					RuleType: "trapped_traders", Status: "active", Timeframe: "15m",
					TrappedTraders: &evaluator.TrappedTradersParams{MinAbsorptionVolume: 250000, TrapSide: "buyers"},
				}
			},
		},
		{
			label: "trapped_traders tf=1m  minVol=500000 side=buyers",
			rule: func() evaluator.Rule {
				return evaluator.Rule{
					ID: "sweep:variant:tt:1m:buyers", MarketSymbol: *symbol, Name: "sweep",
					RuleType: "trapped_traders", Status: "active", Timeframe: "1m",
					TrappedTraders: &evaluator.TrappedTradersParams{MinAbsorptionVolume: 500000, TrapSide: "buyers"},
				}
			},
		},
		{
			label: "stacked_imbalance tf=5m  rows=2 threshold=300%",
			rule: func() evaluator.Rule {
				return evaluator.Rule{
					ID: "sweep:variant:si:5m", MarketSymbol: *symbol, Name: "sweep",
					RuleType: "stacked_imbalance", Status: "active", Timeframe: "5m",
					StackedImbalance: &evaluator.StackedImbalanceParams{ConfirmationRows: 2, ThresholdMultiplier: 300},
				}
			},
		},
		{
			label: "stacked_imbalance tf=1m  rows=2 threshold=300%",
			rule: func() evaluator.Rule {
				return evaluator.Rule{
					ID: "sweep:variant:si:1m", MarketSymbol: *symbol, Name: "sweep",
					RuleType: "stacked_imbalance", Status: "active", Timeframe: "1m",
					StackedImbalance: &evaluator.StackedImbalanceParams{ConfirmationRows: 2, ThresholdMultiplier: 300},
				}
			},
		},
	}

	exitModes := []struct {
		label string
		mode  backtest.ExitMode
	}{
		{"exit=live-default", backtest.ExitModeLiveDefault},
		{"exit=tp2-only", backtest.ExitModeTP2Only},
	}

	trendFilters := []struct {
		label  string
		filter backtest.TrendFilter
	}{
		{"trend=none", nil},
		{"trend=sma20", backtest.SMATrendFilter(20)},
		{"trend=sma50", backtest.SMATrendFilter(50)},
	}

	for _, base := range baseConfigs {
		for _, em := range exitModes {
			for _, tr := range trendFilters {
				rule := base.rule()
				summary := replayVariant(rule, daysTrades, em.mode, tr.filter)
				results = append(results, result{
					label:   fmt.Sprintf("%s %s %s", base.label, em.label, tr.label),
					summary: summary,
				})
			}
		}
	}

	// Only report configurations with enough resolved signals to mean anything.
	var qualifying []result
	for _, r := range results {
		if r.summary.Resolved >= *minResolved {
			qualifying = append(qualifying, r)
		}
	}

	sort.Slice(qualifying, func(i, j int) bool {
		return qualifying[i].summary.NetAvgR > qualifying[j].summary.NetAvgR
	})

	fmt.Printf("\n=== Sweep results: %s %s -> %s (%d total configs, %d with >= %d resolved) ===\n",
		*symbol, *fromFlag, *toFlag, len(results), len(qualifying), *minResolved)
	fmt.Printf("%-55s %8s %10s %10s %10s %10s\n", "config", "signals", "resolved", "winRate", "grossAvgR", "netAvgR")
	for _, r := range qualifying {
		fmt.Printf(
			"%-55s %8d %10d %9.1f%% %+10.3f %+10.3f\n",
			r.label, r.summary.TotalSignals, r.summary.Resolved, r.summary.WinRate*100, r.summary.GrossAvgR, r.summary.NetAvgR,
		)
	}

	if len(qualifying) == 0 {
		fmt.Println("\nNo configuration reached the minimum resolved-signal threshold in this window.")
	}
}

func replay(rule evaluator.Rule, daysTrades [][]marketstate.Trade) backtest.Summary {
	runner := backtest.NewRunner(rule)
	for _, trades := range daysTrades {
		runner.ReplayDay(trades)
	}
	runner.Flush()
	return backtest.Summarize(runner.Signals())
}

func replayVariant(rule evaluator.Rule, daysTrades [][]marketstate.Trade, mode backtest.ExitMode, filter backtest.TrendFilter) backtest.Summary {
	opts := []backtest.RunnerOption{backtest.WithExitMode(mode)}
	if filter != nil {
		opts = append(opts, backtest.WithTrendFilter(filter))
	}
	runner := backtest.NewRunner(rule, opts...)
	for _, trades := range daysTrades {
		runner.ReplayDay(trades)
	}
	runner.Flush()
	return backtest.Summarize(runner.Signals())
}

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
