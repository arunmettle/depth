// Command backtest-validate is the Goal 1 gate-check tool: it loads a
// train window and a separate, later validation window once each, then
// replays a small set of candidate rule configurations (base rule x exit
// mode x quality-score threshold) through both, and only reports
// configurations that are net-positive (after realistic costs) on BOTH
// windows. This directly enforces the walk-forward discipline the earlier
// single-window sweep lacked - two "best of sweep" candidates from a prior
// run collapsed to breakeven/negative on unseen data, so no candidate is
// treated as a real edge here unless it survives an honest train/validate
// split.
//
// Usage:
//
//	go run ./cmd/backtest-validate -symbol BTCUSDT \
//	  -train-from 2024-01-01 -train-to 2024-02-29 \
//	  -validate-from 2024-03-01 -validate-to 2024-03-31 \
//	  -cache-dir ../_bt_cache
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"sentinelflow/engine/internal/backtest"
	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/historicaldata"
	"sentinelflow/engine/internal/marketstate"
)

const dateLayout = "2006-01-02"

type candidate struct {
	label  string
	rule   func(symbol string) evaluator.Rule
	mode   backtest.ExitMode
	filter backtest.TrendFilter
}

func main() {
	symbol := flag.String("symbol", "", "market symbol, e.g. BTCUSDT (required)")
	trainFrom := flag.String("train-from", "", "train window start, UTC, YYYY-MM-DD (required)")
	trainTo := flag.String("train-to", "", "train window end, UTC, YYYY-MM-DD (required)")
	validateFrom := flag.String("validate-from", "", "validation window start, UTC, YYYY-MM-DD (required)")
	validateTo := flag.String("validate-to", "", "validation window end, UTC, YYYY-MM-DD (required)")
	cacheDir := flag.String("cache-dir", "", "optional directory to cache raw daily archives, shared with cmd/backfill and cmd/backtest")
	minResolved := flag.Int("min-resolved", 30, "minimum resolved signals required (in BOTH windows) to report a configuration")
	flag.Parse()

	if *symbol == "" || *trainFrom == "" || *trainTo == "" || *validateFrom == "" || *validateTo == "" {
		flag.Usage()
		log.Fatal("missing required flag: -symbol, -train-from, -train-to, -validate-from, -validate-to are all required")
	}

	ctx := context.Background()
	client := historicaldata.NewClient()

	train, err := loadWindow(ctx, client, *symbol, *trainFrom, *trainTo, *cacheDir)
	if err != nil {
		log.Fatal(err)
	}
	validate, err := loadWindow(ctx, client, *symbol, *validateFrom, *validateTo, *cacheDir)
	if err != nil {
		log.Fatal(err)
	}

	candidates := buildCandidates()

	fmt.Printf("\n=== Walk-forward gate check: %s ===\n", *symbol)
	fmt.Printf("Train:      %s -> %s\n", *trainFrom, *trainTo)
	fmt.Printf("Validation: %s -> %s\n", *validateFrom, *validateTo)
	fmt.Printf("A configuration is only reported if net avg R > 0 on BOTH windows with >= %d resolved signals each.\n\n", *minResolved)
	fmt.Printf(
		"%-70s | %8s %8s %9s | %8s %8s %9s\n",
		"config", "train#", "trainWR", "trainNetR", "valid#", "validWR", "validNetR",
	)

	passCount := 0
	for _, c := range candidates {
		rule := c.rule(*symbol)
		trainSummary := replay(rule, train, c.mode, c.filter)
		validateSummary := replay(rule, validate, c.mode, c.filter)

		passes := trainSummary.Resolved >= *minResolved && validateSummary.Resolved >= *minResolved &&
			trainSummary.NetAvgR > 0 && validateSummary.NetAvgR > 0

		marker := "  "
		if passes {
			marker = "OK"
			passCount++
		}

		fmt.Printf(
			"%s %-67s | %8d %7.1f%% %+9.3f | %8d %7.1f%% %+9.3f\n",
			marker, c.label,
			trainSummary.Resolved, trainSummary.WinRate*100, trainSummary.NetAvgR,
			validateSummary.Resolved, validateSummary.WinRate*100, validateSummary.NetAvgR,
		)
	}

	fmt.Printf("\n%d of %d candidates passed the walk-forward gate (net-positive on both windows).\n", passCount, len(candidates))
	if passCount == 0 {
		fmt.Println("No candidate cleared the gate - none of these configurations should be treated as a real, publishable edge yet.")
	}
}

func buildCandidates() []candidate {
	var candidates []candidate

	baseRules := []struct {
		label string
		build func(symbol string) evaluator.Rule
	}{
		{
			label: "trapped_traders tf=15m minVol=250000 buyers",
			build: func(symbol string) evaluator.Rule {
				return evaluator.Rule{
					ID: "validate:tt:15m", MarketSymbol: symbol, Name: "validate",
					RuleType: "trapped_traders", Status: "active", Timeframe: "15m",
					TrappedTraders: &evaluator.TrappedTradersParams{MinAbsorptionVolume: 250000, TrapSide: "buyers"},
				}
			},
		},
		{
			label: "trapped_traders tf=5m  minVol=250000 buyers",
			build: func(symbol string) evaluator.Rule {
				return evaluator.Rule{
					ID: "validate:tt:5m", MarketSymbol: symbol, Name: "validate",
					RuleType: "trapped_traders", Status: "active", Timeframe: "5m",
					TrappedTraders: &evaluator.TrappedTradersParams{MinAbsorptionVolume: 250000, TrapSide: "buyers"},
				}
			},
		},
		{
			label: "stacked_imbalance tf=5m  rows=2 threshold=300%",
			build: func(symbol string) evaluator.Rule {
				return evaluator.Rule{
					ID: "validate:si:5m", MarketSymbol: symbol, Name: "validate",
					RuleType: "stacked_imbalance", Status: "active", Timeframe: "5m",
					StackedImbalance: &evaluator.StackedImbalanceParams{ConfirmationRows: 2, ThresholdMultiplier: 300},
				}
			},
		},
		{
			label: "stacked_imbalance tf=1m  rows=3 threshold=300%",
			build: func(symbol string) evaluator.Rule {
				return evaluator.Rule{
					ID: "validate:si:1m", MarketSymbol: symbol, Name: "validate",
					RuleType: "stacked_imbalance", Status: "active", Timeframe: "1m",
					StackedImbalance: &evaluator.StackedImbalanceParams{ConfirmationRows: 3, ThresholdMultiplier: 300},
				}
			},
		},
	}

	exitModes := []struct {
		label string
		mode  backtest.ExitMode
	}{
		{"exit=live", backtest.ExitModeLiveDefault},
		{"exit=tp2only", backtest.ExitModeTP2Only},
	}

	qualityThresholds := []struct {
		label string
		min   float64
	}{
		{"quality=none", -1},
		{"quality>=40", 40},
		{"quality>=55", 55},
		{"quality>=65", 65},
		{"quality>=75", 75},
	}

	for _, base := range baseRules {
		for _, em := range exitModes {
			for _, q := range qualityThresholds {
				var filter backtest.TrendFilter
				if q.min >= 0 {
					filter = backtest.QualityFilter(q.min, 20)
				}
				candidates = append(candidates, candidate{
					label:  fmt.Sprintf("%s %s %s", base.label, em.label, q.label),
					rule:   base.build,
					mode:   em.mode,
					filter: filter,
				})
			}
		}
	}

	return candidates
}

func replay(rule evaluator.Rule, daysTrades [][]marketstate.Trade, mode backtest.ExitMode, filter backtest.TrendFilter) backtest.Summary {
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

func loadWindow(ctx context.Context, client *historicaldata.Client, symbol string, fromStr string, toStr string, cacheDir string) ([][]marketstate.Trade, error) {
	from, err := time.Parse(dateLayout, fromStr)
	if err != nil {
		return nil, fmt.Errorf("parse date %q: %w", fromStr, err)
	}
	to, err := time.Parse(dateLayout, toStr)
	if err != nil {
		return nil, fmt.Errorf("parse date %q: %w", toStr, err)
	}
	if to.Before(from) {
		return nil, fmt.Errorf("window end %s is before start %s", toStr, fromStr)
	}

	if cacheDir != "" {
		if err := os.MkdirAll(cacheDir, 0o755); err != nil {
			return nil, fmt.Errorf("create cache dir: %w", err)
		}
	}

	log.Printf("loading %s trades %s -> %s into memory...", symbol, fromStr, toStr)
	daysTrades := make([][]marketstate.Trade, 0)
	total := 0
	for day := from; !day.After(to); day = day.AddDate(0, 0, 1) {
		trades, err := fetchDay(ctx, client, symbol, day, cacheDir)
		if err != nil {
			log.Printf("WARN: %s: %v (skipping)", day.Format(dateLayout), err)
			continue
		}
		daysTrades = append(daysTrades, trades)
		total += len(trades)
	}
	log.Printf("loaded %d total trades across %d days (%s -> %s)", total, len(daysTrades), fromStr, toStr)

	return daysTrades, nil
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
