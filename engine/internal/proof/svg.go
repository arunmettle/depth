package proof

import (
	"fmt"
	"html"
	"strings"
	"time"

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
	if snapshot.Event.Side == "sell" {
		accent = "#b64242"
	}

	width := 720
	height := 960

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
	builder.WriteString(fmt.Sprintf(`<text x="56" y="222" font-family="'Segoe UI', Arial, sans-serif" font-size="18" fill="#50473d">%s</text>`, escape(snapshot.Event.Message)))
	builder.WriteString(fmt.Sprintf(`<text x="56" y="252" font-family="'Segoe UI', Arial, sans-serif" font-size="16" fill="#7a6c59">Bucket %s</text>`, escape(snapshot.Event.BucketStart.UTC().Format(time.RFC3339))))

	builder.WriteString(`<rect x="56" y="286" width="608" height="264" rx="22" fill="#f7f1e6" stroke="#e0d5c3" stroke-width="2"/>`)
	builder.WriteString(`<text x="80" y="324" font-family="'Segoe UI', Arial, sans-serif" font-size="20" font-weight="700" fill="#2e261d">Confirmation Window</text>`)

	maxVolume := 1.0
	for _, candle := range snapshot.Candles {
		if candle.TotalVolume > maxVolume {
			maxVolume = candle.TotalVolume
		}
	}

	barX := 92
	for _, candle := range snapshot.Candles {
		barHeight := int((candle.TotalVolume / maxVolume) * 120)
		if barHeight < 16 {
			barHeight = 16
		}

		fill := "#c7beb2"
		if candle.BuyVolume > candle.SellVolume {
			fill = "#138a5b"
		} else if candle.SellVolume > candle.BuyVolume {
			fill = "#b64242"
		}

		y := 494 - barHeight
		builder.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="90" height="%d" rx="18" fill="%s" opacity="0.9"/>`, barX, y, barHeight, fill))
		builder.WriteString(fmt.Sprintf(`<text x="%d" y="520" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="15" fill="#5b5248">%s</text>`, barX+45, escape(candle.BucketStart.Format("15:04"))))
		barX += 108
	}

	builder.WriteString(`<text x="56" y="604" font-family="'Segoe UI', Arial, sans-serif" font-size="22" font-weight="700" fill="#2e261d">Signal Metrics</text>`)
	builder.WriteString(metricRow(56, 634, "Rule", snapshot.Event.RuleName))
	builder.WriteString(metricRow(56, 686, "Timeframe", snapshot.Event.Timeframe))
	builder.WriteString(metricRow(56, 738, "Candles", fmt.Sprintf("%d", len(snapshot.Candles))))

	if len(snapshot.Candles) > 0 {
		last := snapshot.Candles[len(snapshot.Candles)-1]
		builder.WriteString(metricRow(56, 790, "Close", fmt.Sprintf("%.2f", last.Close)))
		builder.WriteString(metricRow(56, 842, "Volume", fmt.Sprintf("%.4f", last.TotalVolume)))
	}

	builder.WriteString(`<text x="56" y="900" font-family="'Segoe UI', Arial, sans-serif" font-size="16" fill="#7a6c59">Snapshot-first evidence for mobile review, not a full charting terminal.</text>`)
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

func escape(value string) string {
	return html.EscapeString(value)
}
