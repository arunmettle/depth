package proof

import (
	"fmt"
	"html"
	"math"
	"strings"

	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/marketstate"
)

type Snapshot struct {
	Candles []marketstate.Candle
	Event   evaluator.Event
}

func RenderSVG(snapshot Snapshot) string {
	var builder strings.Builder

	accent := "#138a5b"
	accentSoft := "#d9f1e6"
	if snapshot.Event.Side == "sell" {
		accent = "#b64242"
		accentSoft = "#f4dddd"
	}

	width := 720
	height := 960
	window := summarizeWindow(snapshot.Candles)

	builder.WriteString(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" role="img" aria-label="Sentinel Flow proof snapshot">`, width, height, width, height))
	builder.WriteString(`<rect width="100%" height="100%" fill="#f4efe6"/>`)
	builder.WriteString(`<rect x="32" y="32" width="656" height="896" rx="28" fill="#fffaf2" stroke="#d9cdb8" stroke-width="2"/>`)
	builder.WriteString(`<text x="56" y="84" font-family="'Segoe UI', Arial, sans-serif" font-size="18" fill="#766956">Sentinel Flow Proof</text>`)
	builder.WriteString(fmt.Sprintf(`<text x="56" y="132" font-family="'Segoe UI', Arial, sans-serif" font-size="34" font-weight="700" fill="#1f1a14">%s %s %s</text>`,
		escape(snapshot.Event.Symbol),
		escape(strings.ToUpper(snapshot.Event.Side)),
		escape(snapshot.Event.Timeframe),
	))
	builder.WriteString(fmt.Sprintf(`<rect x="56" y="156" width="152" height="34" rx="17" fill="%s"/>`, accent))
	builder.WriteString(fmt.Sprintf(`<text x="132" y="178" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="700" fill="#fff">%s</text>`, escape(strings.ToUpper(snapshot.Event.Side)+" IMBALANCE")))
	builder.WriteString(fmt.Sprintf(`<rect x="224" y="156" width="196" height="34" rx="17" fill="%s"/>`, accentSoft))
	builder.WriteString(fmt.Sprintf(`<text x="322" y="178" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="700" fill="#2e261d">%s</text>`, escape(window.DominantSummary)))
	builder.WriteString(renderWrappedText(56, 220, 18, "#50473d", setupSummary(snapshot.Event), 68, 24))
	builder.WriteString(fmt.Sprintf(`<text x="56" y="268" font-family="'Segoe UI', Arial, sans-serif" font-size="16" fill="#7a6c59">Recorded %s UTC</text>`, escape(snapshot.Event.BucketStart.UTC().Format("2006-01-02 15:04:05"))))

	builder.WriteString(`<rect x="56" y="286" width="608" height="188" rx="22" fill="#f7f1e6" stroke="#e0d5c3" stroke-width="2"/>`)
	builder.WriteString(`<text x="80" y="324" font-family="'Segoe UI', Arial, sans-serif" font-size="20" font-weight="700" fill="#2e261d">Trade Plan</text>`)
	builder.WriteString(metricTile(80, 348, 132, 98, "Entry", formatPrice(snapshot.Event.TradePlan.EntryPrice)))
	builder.WriteString(metricTile(228, 348, 132, 98, "Stop", formatPrice(snapshot.Event.TradePlan.StopLoss)))
	builder.WriteString(metricTile(376, 348, 132, 98, "TP1", formatPrice(snapshot.Event.TradePlan.TakeProfit1)))
	builder.WriteString(metricTile(524, 348, 116, 98, "TP2", formatPrice(snapshot.Event.TradePlan.TakeProfit2)))

	builder.WriteString(`<rect x="56" y="498" width="608" height="206" rx="22" fill="#f7f1e6" stroke="#e0d5c3" stroke-width="2"/>`)
	builder.WriteString(`<text x="80" y="536" font-family="'Segoe UI', Arial, sans-serif" font-size="20" font-weight="700" fill="#2e261d">Confirmation Window</text>`)
	builder.WriteString(`<text x="80" y="564" font-family="'Segoe UI', Arial, sans-serif" font-size="14" fill="#7a6c59">Time</text>`)
	builder.WriteString(`<text x="176" y="564" font-family="'Segoe UI', Arial, sans-serif" font-size="14" fill="#7a6c59">Side</text>`)
	builder.WriteString(`<text x="278" y="564" font-family="'Segoe UI', Arial, sans-serif" font-size="14" fill="#7a6c59">Imbalance</text>`)
	builder.WriteString(`<text x="432" y="564" font-family="'Segoe UI', Arial, sans-serif" font-size="14" fill="#7a6c59">Close</text>`)
	builder.WriteString(`<text x="546" y="564" font-family="'Segoe UI', Arial, sans-serif" font-size="14" fill="#7a6c59">Volume</text>`)

	rowY := 594
	for index, candle := range snapshot.Candles {
		if index > 0 {
			builder.WriteString(fmt.Sprintf(`<line x1="80" y1="%d" x2="640" y2="%d" stroke="#e6dccd" stroke-width="1"/>`, rowY-18, rowY-18))
		}

		sideLabel, sideColor, ratio := candleSignal(candle)
		builder.WriteString(fmt.Sprintf(`<text x="80" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="600" fill="#2e261d">%s</text>`, rowY, escape(candle.BucketStart.Format("15:04"))))
		builder.WriteString(fmt.Sprintf(`<text x="176" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="700" fill="%s">%s</text>`, rowY, sideColor, escape(sideLabel)))
		builder.WriteString(fmt.Sprintf(`<text x="278" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="16" fill="#2e261d">%s</text>`, rowY, escape(ratio)))
		builder.WriteString(fmt.Sprintf(`<text x="432" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="16" fill="#2e261d">%s</text>`, rowY, escape(formatPrice(candle.Close))))
		builder.WriteString(fmt.Sprintf(`<text x="546" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="16" fill="#2e261d">%s</text>`, rowY, escape(formatNumber(candle.TotalVolume))))
		rowY += 40
	}

	builder.WriteString(`<text x="56" y="760" font-family="'Segoe UI', Arial, sans-serif" font-size="22" font-weight="700" fill="#2e261d">Setup Context</text>`)
	builder.WriteString(metricRow(56, 790, "Rule", snapshot.Event.RuleName))
	builder.WriteString(metricRow(56, 842, "Signal range", formatSignalRange(snapshot.Event.TradePlan)))
	builder.WriteString(metricRow(360, 790, "Window bias", window.DominantSummary))
	builder.WriteString(metricRow(360, 842, "Imbalance", window.RatioSummary))

	builder.WriteString(`<text x="56" y="900" font-family="'Segoe UI', Arial, sans-serif" font-size="16" fill="#7a6c59">Mobile setup card: why it triggered, where invalidation sits, and where first targets are placed.</text>`)
	builder.WriteString(`</svg>`)

	return builder.String()
}

func metricRow(x int, y int, label string, value string) string {
	return fmt.Sprintf(
		`<text x="%d" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="16" fill="#7a6c59">%s</text><text x="%d" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="26" font-weight="700" fill="#201a14">%s</text>`,
		x,
		y,
		escape(label),
		x,
		y+28,
		escape(value),
	)
}

func metricTile(x int, y int, width int, height int, label string, value string) string {
	return fmt.Sprintf(
		`<rect x="%d" y="%d" width="%d" height="%d" rx="18" fill="#fffaf2" stroke="#e6dccd" stroke-width="1"/><text x="%d" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="14" fill="#7a6c59">%s</text><text x="%d" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="22" font-weight="700" fill="#201a14">%s</text>`,
		x,
		y,
		width,
		height,
		x+16,
		y+28,
		escape(label),
		x+16,
		y+62,
		escape(value),
	)
}

type windowSummary struct {
	CloseDeltaSummary string
	DominantSummary   string
	LastCloseSummary  string
	RatioSummary      string
	TotalBuy          float64
	TotalSell         float64
}

func summarizeWindow(candles []marketstate.Candle) windowSummary {
	if len(candles) == 0 {
		return windowSummary{
			CloseDeltaSummary: "N/A",
			DominantSummary:   "No window data",
			LastCloseSummary:  "N/A",
			RatioSummary:      "N/A",
		}
	}

	var totalBuy float64
	var totalSell float64
	for _, candle := range candles {
		totalBuy += candle.BuyVolume
		totalSell += candle.SellVolume
	}

	first := candles[0]
	last := candles[len(candles)-1]
	closeDelta := last.Close - first.Open
	closeDeltaSummary := fmt.Sprintf("%+.2f", closeDelta)
	dominant := "Balanced window"
	if totalBuy > totalSell {
		dominant = "Buyers dominated"
	} else if totalSell > totalBuy {
		dominant = "Sellers dominated"
	}

	return windowSummary{
		CloseDeltaSummary: closeDeltaSummary,
		DominantSummary:   dominant,
		LastCloseSummary:  formatPrice(last.Close),
		RatioSummary:      volumeRatioSummary(totalBuy, totalSell),
		TotalBuy:          totalBuy,
		TotalSell:         totalSell,
	}
}

func candleSignal(candle marketstate.Candle) (string, string, string) {
	switch {
	case candle.BuyVolume > candle.SellVolume:
		return "Buy", "#138a5b", volumeRatioSummary(candle.BuyVolume, candle.SellVolume)
	case candle.SellVolume > candle.BuyVolume:
		return "Sell", "#b64242", volumeRatioSummary(candle.SellVolume, candle.BuyVolume)
	default:
		return "Balanced", "#6b6258", "1.0x"
	}
}

func volumeRatioSummary(dominant float64, opposing float64) string {
	if dominant <= 0 && opposing <= 0 {
		return "N/A"
	}

	if opposing <= 0 {
		return "inf"
	}

	ratio := dominant / opposing
	if math.IsInf(ratio, 0) || math.IsNaN(ratio) {
		return "N/A"
	}

	return fmt.Sprintf("%.1fx", ratio)
}

func formatNumber(value float64) string {
	switch {
	case value >= 1000:
		return fmt.Sprintf("%.0f", value)
	case value >= 10:
		return fmt.Sprintf("%.2f", value)
	case value >= 1:
		return fmt.Sprintf("%.3f", value)
	default:
		return fmt.Sprintf("%.4f", value)
	}
}

func formatPrice(value float64) string {
	if value == 0 {
		return "N/A"
	}

	if math.Abs(value) >= 1000 {
		return fmt.Sprintf("%.2f", value)
	}

	return fmt.Sprintf("%.4f", value)
}

func formatPlanTargets(plan evaluator.TradePlan) string {
	if plan.TakeProfit1 <= 0 || plan.TakeProfit2 <= 0 {
		return "N/A"
	}

	return fmt.Sprintf("%s / %s", formatPrice(plan.TakeProfit1), formatPrice(plan.TakeProfit2))
}

func formatSignalRange(plan evaluator.TradePlan) string {
	if plan.SignalLow <= 0 && plan.SignalHigh <= 0 {
		return "N/A"
	}

	return fmt.Sprintf("%s to %s", formatPrice(plan.SignalLow), formatPrice(plan.SignalHigh))
}

func setupSummary(event evaluator.Event) string {
	if event.TradePlan.EntryPrice <= 0 {
		return event.Message
	}

	return fmt.Sprintf(
		"%s setup confirmed. Entry %s with invalidation at %s and targets at %s then %s.",
		strings.ToUpper(event.Side),
		formatPrice(event.TradePlan.EntryPrice),
		formatPrice(event.TradePlan.StopLoss),
		formatPrice(event.TradePlan.TakeProfit1),
		formatPrice(event.TradePlan.TakeProfit2),
	)
}

func renderWrappedText(x int, y int, fontSize int, fill string, value string, maxChars int, lineHeight int) string {
	lines := wrapText(value, maxChars)
	if len(lines) == 0 {
		lines = []string{""}
	}

	var builder strings.Builder
	for index, line := range lines {
		builder.WriteString(fmt.Sprintf(
			`<text x="%d" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="%d" fill="%s">%s</text>`,
			x,
			y+(index*lineHeight),
			fontSize,
			fill,
			escape(line),
		))
	}

	return builder.String()
}

func wrapText(value string, maxChars int) []string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || maxChars <= 0 {
		return nil
	}

	words := strings.Fields(trimmed)
	lines := make([]string, 0, 3)
	current := ""

	for _, word := range words {
		candidate := word
		if current != "" {
			candidate = current + " " + word
		}

		if len(candidate) <= maxChars {
			current = candidate
			continue
		}

		if current != "" {
			lines = append(lines, current)
			if len(lines) == 2 {
				lines = append(lines, truncateWithEllipsis(word, maxChars))
				return lines
			}
		}

		current = word
	}

	if current != "" {
		lines = append(lines, truncateWithEllipsis(current, maxChars))
	}

	if len(lines) > 3 {
		return lines[:3]
	}

	return lines
}

func truncateWithEllipsis(value string, maxChars int) string {
	if len(value) <= maxChars {
		return value
	}

	if maxChars <= 1 {
		return value[:maxChars]
	}

	if maxChars <= 3 {
		return value[:maxChars]
	}

	return value[:maxChars-3] + "..."
}

func escape(value string) string {
	return html.EscapeString(value)
}
