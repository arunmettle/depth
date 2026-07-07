package telegram

import (
	"fmt"
	"strings"
	"time"

	"sentinelflow/engine/internal/alerts"
)

func FormatCaption(record alerts.Record) string {
	lines := []string{
		fmt.Sprintf("%s | %s | %s", record.MarketSymbol, strings.ToUpper(record.Side), record.Timeframe),
		record.RuleName,
	}

	if record.TradePlan.EntryPrice > 0 {
		lines = append(lines,
			"Setup: stacked imbalance confirmed",
			fmt.Sprintf("Entry: %.2f", record.TradePlan.EntryPrice),
			fmt.Sprintf("Invalidation: %.2f", record.TradePlan.StopLoss),
			fmt.Sprintf("Targets: %.2f (%.1fR) / %.2f (%.1fR)", record.TradePlan.TakeProfit1, record.TradePlan.RiskReward1, record.TradePlan.TakeProfit2, record.TradePlan.RiskReward2),
			fmt.Sprintf("Signal window: %.2f to %.2f", record.TradePlan.SignalLow, record.TradePlan.SignalHigh),
		)
	} else {
		lines = append(lines, record.Message)
	}

	lines = append(lines, fmt.Sprintf("Recorded %s", record.CreatedAt.UTC().Format(time.RFC3339)))

	return strings.Join(lines, "\n")
}
