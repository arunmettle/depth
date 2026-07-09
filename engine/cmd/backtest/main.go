// Command backtest replays Bybit's free public historical trade archives
// through the exact same rule evaluator and outcome-resolution logic the
// live engine uses (engine/internal/backtest), producing a real historical
// win rate and R-multiple track record for one rule configuration - not a
// reimplemented approximation, and not the narrow "last ~1,000 live
// trades" replay preview.
//
// Usage:
//
//	go run ./cmd/backtest -symbol BTCUSDT -from 2024-01-01 -to 2024-01-31 \
//	  -rule-type stacked_imbalance -timeframe 1m \
//	  -confirmation-rows 3 -threshold-multiplier 300
//
//	go run ./cmd/backtest -symbol BTCUSDT -from 2024-01-01 -to 2024-01-31 \
//	  -rule-type trapped_traders -timeframe 5m \
//	  -min-absorption-volume 250000 -trap-side both
//
// Add -cache-dir to reuse (or build) a local raw-archive cache shared with
// cmd/backfill, and -out to also write a CSV of every individual signal.
//
// Add -save-supabase to also insert the run's headline summary into
// Supabase's public.backtest_runs table (read by the web app's public
// backtest page), using SUPABASE_URL and SUPABASE_SECRET_KEY from the
// environment - the same credentials and REST convention the live engine
// already uses.
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

	"sentinelflow/engine/internal/backtest"
	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/historicaldata"
	"sentinelflow/engine/internal/marketstate"
)

const dateLayout = "2006-01-02"

func main() {
	symbol := flag.String("symbol", "", "market symbol, e.g. BTCUSDT (required)")
	fromFlag := flag.String("from", "", "start date, UTC, YYYY-MM-DD, inclusive (required)")
	toFlag := flag.String("to", "", "end date, UTC, YYYY-MM-DD, inclusive (required)")
	ruleType := flag.String("rule-type", "stacked_imbalance", "stacked_imbalance or trapped_traders")
	timeframe := flag.String("timeframe", "1m", "1m, 5m, or 15m")
	confirmationRows := flag.Int("confirmation-rows", 3, "stacked_imbalance: number of consecutive one-sided candles required")
	thresholdMultiplier := flag.Float64("threshold-multiplier", 300, "stacked_imbalance: dominant/opposing volume ratio threshold, as a percent (300 = 3x)")
	minAbsorptionVolume := flag.Float64("min-absorption-volume", 250000, "trapped_traders: minimum trap-candle notional volume")
	trapSide := flag.String("trap-side", "both", "trapped_traders: buyers, sellers, or both")
	cacheDir := flag.String("cache-dir", "", "optional directory to cache raw daily archives, shared with cmd/backfill")
	outPath := flag.String("out", "", "optional path to write a CSV of every individual signal")
	saveSupabase := flag.Bool("save-supabase", false, "insert the run's headline summary into Supabase's public.backtest_runs table")
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

	if to.Before(from) {
		log.Fatal("-to must not be before -from")
	}

	rule, err := buildRule(*symbol, *ruleType, *timeframe, *confirmationRows, *thresholdMultiplier, *minAbsorptionVolume, *trapSide)
	if err != nil {
		log.Fatal(err)
	}

	if err := run(rule, from, to, *cacheDir, *outPath, *saveSupabase); err != nil {
		log.Fatal(err)
	}
}

func buildRule(symbol string, ruleType string, timeframe string, confirmationRows int, thresholdMultiplier float64, minAbsorptionVolume float64, trapSide string) (evaluator.Rule, error) {
	rule := evaluator.Rule{
		ID:           fmt.Sprintf("backtest:%s:%s:%s", symbol, timeframe, ruleType),
		MarketSymbol: symbol,
		Name:         fmt.Sprintf("%s %s %s (backtest)", symbol, timeframe, ruleType),
		RuleType:     ruleType,
		Status:       "active",
		Timeframe:    timeframe,
	}

	switch ruleType {
	case "stacked_imbalance":
		rule.StackedImbalance = &evaluator.StackedImbalanceParams{
			ConfirmationRows:    confirmationRows,
			ThresholdMultiplier: thresholdMultiplier,
		}
	case "trapped_traders":
		rule.TrappedTraders = &evaluator.TrappedTradersParams{
			MinAbsorptionVolume: minAbsorptionVolume,
			TrapSide:            trapSide,
		}
	default:
		return evaluator.Rule{}, fmt.Errorf("unsupported -rule-type %q (want stacked_imbalance or trapped_traders)", ruleType)
	}

	return rule, nil
}

func run(rule evaluator.Rule, from time.Time, to time.Time, cacheDir string, outPath string, saveSupabase bool) error {
	if cacheDir != "" {
		if err := os.MkdirAll(cacheDir, 0o755); err != nil {
			return fmt.Errorf("create cache dir: %w", err)
		}
	}

	client := historicaldata.NewClient()
	ctx := context.Background()
	runner := backtest.NewRunner(rule)

	totalTrades := 0
	totalDays := 0

	for day := from; !day.After(to); day = day.AddDate(0, 0, 1) {
		trades, err := fetchDay(ctx, client, rule.MarketSymbol, day, cacheDir)
		if err != nil {
			log.Printf("WARN: %s: %v (skipping)", day.Format(dateLayout), err)
			continue
		}

		runner.ReplayDay(trades)
		totalTrades += len(trades)
		totalDays++
		log.Printf("%s: %d trades replayed", day.Format(dateLayout), len(trades))
	}

	runner.Flush()
	signals := runner.Signals()
	summary := backtest.Summarize(signals)

	log.Printf(
		"done: %s, %d days, %d total trades replayed, %d signals generated",
		rule.MarketSymbol, totalDays, totalTrades, summary.TotalSignals,
	)

	printSummary(rule, summary)

	if outPath != "" {
		if err := writeSignalsCSV(outPath, signals); err != nil {
			return fmt.Errorf("write signals CSV: %w", err)
		}
		log.Printf("wrote %d signals to %s", len(signals), outPath)
	}

	if saveSupabase {
		if err := saveToSupabase(ctx, rule, from, to, totalTrades, summary); err != nil {
			return fmt.Errorf("save backtest run to Supabase: %w", err)
		}
		log.Printf("saved backtest run summary to Supabase backtest_runs")
	}

	return nil
}

func saveToSupabase(ctx context.Context, rule evaluator.Rule, from time.Time, to time.Time, totalTrades int, summary backtest.Summary) error {
	url := os.Getenv("SUPABASE_URL")
	secretKey := os.Getenv("SUPABASE_SECRET_KEY")

	writer := backtest.NewSupabaseWriter(url, secretKey)
	if !writer.IsConfigured() {
		return fmt.Errorf("SUPABASE_URL and SUPABASE_SECRET_KEY must both be set to use -save-supabase")
	}

	params := map[string]any{}
	if rule.StackedImbalance != nil {
		params["confirmationRows"] = rule.StackedImbalance.ConfirmationRows
		params["thresholdMultiplier"] = rule.StackedImbalance.ThresholdMultiplier
	}
	if rule.TrappedTraders != nil {
		params["minAbsorptionVolume"] = rule.TrappedTraders.MinAbsorptionVolume
		params["trapSide"] = rule.TrappedTraders.TrapSide
	}

	return writer.SaveRun(ctx, backtest.Run{
		Symbol:              rule.MarketSymbol,
		RuleType:            rule.RuleType,
		Timeframe:           rule.Timeframe,
		Params:              params,
		PeriodStart:         from,
		PeriodEnd:           to,
		TotalTradesReplayed: totalTrades,
	}, summary)
}

func printSummary(rule evaluator.Rule, summary backtest.Summary) {
	fmt.Printf("\n=== Backtest summary: %s ===\n", rule.Name)
	fmt.Printf("Total signals:   %d\n", summary.TotalSignals)
	fmt.Printf("Resolved:        %d (wins %d, losses %d)\n", summary.Resolved, summary.Wins, summary.Losses)
	fmt.Printf("Expired:         %d\n", summary.Expired)
	fmt.Printf("Still pending:   %d\n", summary.Pending)

	if summary.Resolved == 0 {
		fmt.Println("No resolved signals in this window - widen the date range or relax rule thresholds.")
		return
	}

	fmt.Printf("Win rate:        %.1f%%\n", summary.WinRate*100)
	fmt.Printf("Gross avg R:     %+.3f\n", summary.GrossAvgR)
	fmt.Printf("Net avg R:       %+.3f (after realistic round-trip trading costs)\n", summary.NetAvgR)
	fmt.Printf("Gross total R:   %+.2f\n", summary.GrossTotalR)
	fmt.Printf("Net total R:     %+.2f\n", summary.NetTotalR)

	if summary.Resolved < 30 {
		fmt.Println("\nWARNING: fewer than 30 resolved signals - this sample is too small to trust as a real edge estimate.")
	}
}

// fetchDay serves one day's trades from cacheDir when available, otherwise
// downloads and, if cacheDir is set, saves the raw archive for next time.
// Mirrors cmd/backfill's fetchDay so both tools share one cache format.
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

func writeSignalsCSV(path string, signals []backtest.Signal) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	if err := writer.Write([]string{
		"bucketStart", "side", "entry", "stop", "tp1", "tp2", "status", "hitAt", "rMultiple", "note",
	}); err != nil {
		return err
	}

	for _, signal := range signals {
		row := []string{
			signal.Event.BucketStart.UTC().Format(time.RFC3339),
			signal.Event.Side,
			strconv.FormatFloat(signal.Event.TradePlan.EntryPrice, 'f', -1, 64),
			strconv.FormatFloat(signal.Event.TradePlan.StopLoss, 'f', -1, 64),
			strconv.FormatFloat(signal.Event.TradePlan.TakeProfit1, 'f', -1, 64),
			strconv.FormatFloat(signal.Event.TradePlan.TakeProfit2, 'f', -1, 64),
			string(signal.Outcome.Status),
			formatHitAt(signal.Outcome.HitAt),
			strconv.FormatFloat(signal.Outcome.RMultiple, 'f', -1, 64),
			signal.Outcome.Note,
		}

		if err := writer.Write(row); err != nil {
			return err
		}
	}

	return nil
}

func formatHitAt(hitAt time.Time) string {
	if hitAt.IsZero() {
		return ""
	}
	return hitAt.UTC().Format(time.RFC3339)
}
