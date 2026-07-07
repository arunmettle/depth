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

	builder.WriteString(`<rect x="56" y="286" width="608" height="236" rx="22" fill="#f7f1e6" stroke="#e0d5c3" stroke-width="2"/>`)
	builder.WriteString(`<text x="80" y="324" font-family="'Segoe UI', Arial, sans-serif" font-size="20" font-weight="700" fill="#2e261d">Flow Strip</text>`)
	builder.WriteString(`<text x="80" y="346" font-family="'Segoe UI', Arial, sans-serif" font-size="14" fill="#7a6c59">3-candle confirmation window rendered as directional dominance bars.</text>`)
	builder.WriteString(renderFlowStrip(snapshot.Candles, 80, 360, 560, 132))

	builder.WriteString(`<rect x="56" y="538" width="608" height="150" rx="22" fill="#f7f1e6" stroke="#e0d5c3" stroke-width="2"/>`)
	builder.WriteString(`<text x="80" y="576" font-family="'Segoe UI', Arial, sans-serif" font-size="20" font-weight="700" fill="#2e261d">Trade Plan</text>`)
	builder.WriteString(metricTile(80, 600, 132, 70, "Entry", formatPrice(snapshot.Event.TradePlan.EntryPrice)))
	builder.WriteString(metricTile(228, 600, 132, 70, "Stop", formatPrice(snapshot.Event.TradePlan.StopLoss)))
	builder.WriteString(metricTile(376, 600, 132, 70, "TP1", formatPrice(snapshot.Event.TradePlan.TakeProfit1)))
	builder.WriteString(metricTile(524, 600, 116, 70, "TP2", formatPrice(snapshot.Event.TradePlan.TakeProfit2)))

	builder.WriteString(`<text x="56" y="734" font-family="'Segoe UI', Arial, sans-serif" font-size="22" font-weight="700" fill="#2e261d">Setup Context</text>`)
	builder.WriteString(metricRow(56, 764, "Rule", snapshot.Event.RuleName))
	builder.WriteString(metricRow(56, 816, "Signal range", formatSignalRange(snapshot.Event.TradePlan)))
	builder.WriteString(metricRow(360, 764, "Window bias", window.DominantSummary))
	builder.WriteString(metricRow(360, 816, "Imbalance", window.RatioSummary))

	builder.WriteString(`<text x="56" y="900" font-family="'Segoe UI', Arial, sans-serif" font-size="16" fill="#7a6c59">Mobile setup card: the strip shows dominance, the plan shows invalidation, and the bottom explains the signal.</text>`)
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

func renderFlowStrip(candles []marketstate.Candle, x int, y int, width int, height int) string {
	var builder strings.Builder

	builder.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="%d" height="%d" rx="18" fill="#fffaf2" stroke="#e6dccd" stroke-width="1"/>`, x, y, width, height))

	if len(candles) == 0 {
		builder.WriteString(fmt.Sprintf(`<text x="%d" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="16" fill="#7a6c59">No candle window available</text>`, x+16, y+38))
		return builder.String()
	}

	maxVolume := 0.0
	for _, candle := range candles {
		if candle.TotalVolume > maxVolume {
			maxVolume = candle.TotalVolume
		}
	}
	if maxVolume <= 0 {
		maxVolume = 1
	}

	cardWidth := (width - 20) / len(candles)
	cardGap := 10
	chartHeight := height - 60

	for index, candle := range candles {
		cardX := x + index*cardWidth
		if index > 0 {
			cardX += cardGap
		}
		panelWidth := cardWidth - cardGap
		sideLabel, sideColor, ratio := candleSignal(candle)
		activity := candle.TotalVolume / maxVolume
		panelFill := "#f2f8f4"
		if sideLabel == "Sell" {
			panelFill = "#fbf0f0"
		} else if sideLabel == "Balanced" {
			panelFill = "#f6f3ed"
		}

		builder.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="%d" height="%d" rx="16" fill="%s" stroke="%s" stroke-width="1.2"/>`,
			cardX,
			y,
			panelWidth,
			height,
			panelFill,
			sideColor,
		))
		builder.WriteString(fmt.Sprintf(`<text x="%d" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="14" font-weight="700" fill="#2e261d">%s</text>`,
			cardX+14,
			y+26,
			escape(candle.BucketStart.Format("15:04")),
		))
		builder.WriteString(fmt.Sprintf(`<text x="%d" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="14" font-weight="700" fill="%s">%s</text>`,
			cardX+panelWidth-14,
			y+26,
			sideColor,
			escape(ratio),
		))

		midX := cardX + panelWidth/2
		chartTop := y + 40
		chartBottom := y + chartHeight - 8
		chartWidth := panelWidth - 28
		barMaxWidth := (chartWidth * 34) / 100
		if barMaxWidth < 24 {
			barMaxWidth = 24
		}

		builder.WriteString(fmt.Sprintf(`<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="2"/>`,
			midX,
			chartTop,
			midX,
			chartBottom,
			sideColor,
		))
		builder.WriteString(fmt.Sprintf(`<circle cx="%d" cy="%d" r="3" fill="%s"/>`, midX, chartTop, sideColor))
		builder.WriteString(fmt.Sprintf(`<circle cx="%d" cy="%d" r="3" fill="%s"/>`, midX, chartBottom, sideColor))

		buyWidth := int(float64(barMaxWidth) * (candle.BuyVolume / maxVolume))
		sellWidth := int(float64(barMaxWidth) * (candle.SellVolume / maxVolume))
		barY1 := y + 72
		barY2 := y + 96

		builder.WriteString(fmt.Sprintf(`<text x="%d" y="%d" text-anchor="end" font-family="'Segoe UI', Arial, sans-serif" font-size="12" fill="#4f8f67">Buy</text>`, midX-34, barY1+10))
		builder.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="%d" height="14" rx="7" fill="#138a5b"/>`, midX-30-buyWidth, barY1, buyWidth))
		builder.WriteString(fmt.Sprintf(`<text x="%d" y="%d" text-anchor="start" font-family="'Segoe UI', Arial, sans-serif" font-size="12" fill="#a25757">Sell</text>`, midX+34, barY2+10))
		builder.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="%d" height="14" rx="7" fill="#b64242"/>`, midX+30, barY2, sellWidth))

		activityHeight := 8 + int(activity*16)
		builder.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="%d" height="%d" rx="4" fill="%s" fill-opacity="0.22"/>`,
			cardX+12,
			y+height-18-activityHeight,
			panelWidth-24,
			activityHeight,
			sideColor,
		))

		builder.WriteString(fmt.Sprintf(`<text x="%d" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="12" fill="#7a6c59">%s</text>`,
			cardX+14,
			y+height-8,
			escape(formatNumber(candle.TotalVolume)),
		))
	}

	return builder.String()
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
