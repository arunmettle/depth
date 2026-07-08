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
	Candles   []marketstate.Candle
	Event     evaluator.Event
	OrderBook marketstate.OrderBookSnapshot
}

func RenderSVG(snapshot Snapshot) string {
	var builder strings.Builder

	accent := "#138a5b"
	accentSoft := "#d9f1e6"
	if snapshot.Event.Side == "sell" {
		accent = "#b64242"
		accentSoft = "#f4dddd"
	}

	width := DefaultWidth
	height := DefaultHeight
	window := summarizeWindow(snapshot.Candles)

	builder.WriteString(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" role="img" aria-label="Sentinel Flow proof snapshot">`, width, height, width, height))
	builder.WriteString(`<rect width="100%" height="100%" fill="#f4efe6"/>`)
	builder.WriteString(`<rect x="32" y="32" width="656" height="1360" rx="28" fill="#fffaf2" stroke="#d9cdb8" stroke-width="2"/>`)
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

	const orderBookBoxY = 704
	const orderBookBoxHeight = 336
	builder.WriteString(fmt.Sprintf(`<rect x="56" y="%d" width="608" height="%d" rx="22" fill="#f7f1e6" stroke="#e0d5c3" stroke-width="2"/>`, orderBookBoxY, orderBookBoxHeight))
	builder.WriteString(fmt.Sprintf(`<text x="80" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="20" font-weight="700" fill="#2e261d">Live Order Book</text>`, orderBookBoxY+38))
	builder.WriteString(fmt.Sprintf(`<text x="80" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="14" fill="#7a6c59">Resting bid/ask depth captured from Bybit at signal time (top %d levels each side).</text>`, orderBookBoxY+58, orderBookLadderDisplayDepth))
	builder.WriteString(renderOrderBookLadder(snapshot.OrderBook, 80, orderBookBoxY+74, 560, orderBookBoxHeight-88))

	setupContextTitleY := orderBookBoxY + orderBookBoxHeight + 46
	builder.WriteString(fmt.Sprintf(`<text x="56" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="22" font-weight="700" fill="#2e261d">Setup Context</text>`, setupContextTitleY))
	builder.WriteString(fullWidthMetricRow(56, setupContextTitleY+30, 608, "Rule", snapshot.Event.RuleName))
	builder.WriteString(fullWidthMetricRow(56, setupContextTitleY+104, 608, "Signal range", formatSignalRange(snapshot.Event.TradePlan)))
	builder.WriteString(fullWidthMetricRow(56, setupContextTitleY+166, 608, "Window bias", fmt.Sprintf("%s (%s)", window.DominantSummary, window.RatioSummary)))

	builder.WriteString(renderWrappedText(56, setupContextTitleY+250, 16, "#7a6c59", "Mobile setup card: the strip shows dominance, the book shows real resting liquidity, and the plan shows invalidation.", 74, 22))
	builder.WriteString(`</svg>`)

	return builder.String()
}

// fullWidthMetricRow renders a label/value pair on its own full-width row so
// long values (rule names, signal ranges) cannot visually collide with a
// neighboring column. The value is truncated with an ellipsis if it would
// otherwise overflow the row width at the rendered font size.
func fullWidthMetricRow(x int, y int, width int, label string, value string) string {
	const fontSize = 22
	const avgCharWidth = 12.5
	maxChars := int(float64(width) / avgCharWidth)
	if maxChars < 8 {
		maxChars = 8
	}

	return fmt.Sprintf(
		`<text x="%d" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="16" fill="#7a6c59">%s</text><text x="%d" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="%d" font-weight="700" fill="#201a14">%s</text>`,
		x,
		y,
		escape(label),
		x,
		y+28,
		fontSize,
		escape(truncateWithEllipsis(value, maxChars)),
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

// orderBookLadderDisplayDepth is how many resting levels per side we render
// in the proof's order book ladder.
const orderBookLadderDisplayDepth = 5

// renderOrderBookLadder draws a compact DOM-style price ladder from a real
// order book snapshot: worse asks at the top, the best ask just above the
// midline, then the best bid just below the midline down to the worst bid.
// Bar length is proportional to resting size at that level, scaled against
// the largest level shown, so it reflects genuine liquidity rather than a
// fabricated heatmap.
func renderOrderBookLadder(book marketstate.OrderBookSnapshot, x int, y int, width int, height int) string {
	var builder strings.Builder

	builder.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="%d" height="%d" rx="16" fill="#fffaf2" stroke="#e6dccd" stroke-width="1"/>`, x, y, width, height))

	if len(book.Bids) == 0 && len(book.Asks) == 0 {
		builder.WriteString(fmt.Sprintf(`<text x="%d" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="16" fill="#7a6c59">Order book not captured for this alert</text>`, x+16, y+38))
		return builder.String()
	}

	asks := book.Asks
	if len(asks) > orderBookLadderDisplayDepth {
		asks = asks[:orderBookLadderDisplayDepth]
	}
	bids := book.Bids
	if len(bids) > orderBookLadderDisplayDepth {
		bids = bids[:orderBookLadderDisplayDepth]
	}

	maxSize := 0.0
	var totalBidSize, totalAskSize float64
	for _, level := range bids {
		if level.Size > maxSize {
			maxSize = level.Size
		}
		totalBidSize += level.Size
	}
	for _, level := range asks {
		if level.Size > maxSize {
			maxSize = level.Size
		}
		totalAskSize += level.Size
	}
	if maxSize <= 0 {
		maxSize = 1
	}

	const rowPitch = 22
	const priceColumnX = 16
	const barStartOffset = 96
	barMaxWidth := width - barStartOffset - 96

	rowY := y + 16

	// Worse (higher) asks render first so the best ask lands just above the
	// midline, matching a real DOM ladder.
	for index := len(asks) - 1; index >= 0; index-- {
		level := asks[index]
		builder.WriteString(renderOrderBookRow(x, rowY, priceColumnX, barStartOffset, barMaxWidth, maxSize, level, "#b64242"))
		rowY += rowPitch
	}

	builder.WriteString(fmt.Sprintf(`<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#d9cdb8" stroke-width="1"/>`, x+8, rowY+2, x+width-8, rowY+2))
	builder.WriteString(fmt.Sprintf(`<text x="%d" y="%d" text-anchor="end" font-family="'Segoe UI', Arial, sans-serif" font-size="12" fill="#7a6c59">%s</text>`, x+width-8, rowY+18, escape(orderBookImbalanceLabel(totalBidSize, totalAskSize))))
	rowY += 26

	// Best bid renders first so it lands just below the midline, decreasing
	// in price further down the ladder.
	for _, level := range bids {
		builder.WriteString(renderOrderBookRow(x, rowY, priceColumnX, barStartOffset, barMaxWidth, maxSize, level, "#138a5b"))
		rowY += rowPitch
	}

	return builder.String()
}

func renderOrderBookRow(x int, y int, priceColumnX int, barStartOffset int, barMaxWidth int, maxSize float64, level marketstate.OrderBookLevel, color string) string {
	barWidth := int(float64(barMaxWidth) * (level.Size / maxSize))
	if barWidth < 2 {
		barWidth = 2
	}

	return fmt.Sprintf(
		`<text x="%d" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="13" font-weight="700" fill="#2e261d">%s</text><rect x="%d" y="%d" width="%d" height="12" rx="6" fill="%s" fill-opacity="0.85"/><text x="%d" y="%d" font-family="'Segoe UI', Arial, sans-serif" font-size="12" fill="#7a6c59">%s</text>`,
		x+priceColumnX,
		y,
		escape(formatPrice(level.Price)),
		x+barStartOffset,
		y-10,
		barWidth,
		color,
		x+barStartOffset+barWidth+8,
		y,
		escape(formatNumber(level.Size)),
	)
}

func orderBookImbalanceLabel(totalBidSize float64, totalAskSize float64) string {
	total := totalBidSize + totalAskSize
	if total <= 0 {
		return "Book imbalance: N/A"
	}

	bidShare := (totalBidSize / total) * 100
	if bidShare >= 50 {
		return fmt.Sprintf("Book imbalance: %.0f%% bid", bidShare)
	}

	return fmt.Sprintf("Book imbalance: %.0f%% ask", 100-bidShare)
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

		// Labels sit directly above their bar, anchored to the bar's fixed
		// edge, so a long bar (which grows away from that edge) can never
		// grow underneath and cover the label.
		builder.WriteString(fmt.Sprintf(`<text x="%d" y="%d" text-anchor="end" font-family="'Segoe UI', Arial, sans-serif" font-size="12" fill="#4f8f67">Buy</text>`, midX-30, barY1-4))
		builder.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="%d" height="14" rx="7" fill="#138a5b"/>`, midX-30-buyWidth, barY1, buyWidth))
		builder.WriteString(fmt.Sprintf(`<text x="%d" y="%d" text-anchor="start" font-family="'Segoe UI', Arial, sans-serif" font-size="12" fill="#a25757">Sell</text>`, midX+30, barY2-4))
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
