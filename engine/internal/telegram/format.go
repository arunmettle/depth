package telegram

import (
	"fmt"
	"strings"
	"time"

	"sentinelflow/engine/internal/alerts"
)

func FormatCaption(record alerts.Record) string {
	return strings.Join([]string{
		fmt.Sprintf("%s %s %s", record.MarketSymbol, strings.ToUpper(record.Side), record.Timeframe),
		record.RuleName,
		record.Message,
		fmt.Sprintf("Recorded %s", record.CreatedAt.UTC().Format(time.RFC3339)),
	}, "\n")
}
