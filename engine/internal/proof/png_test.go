package proof

import (
	"bytes"
	"image/color"
	"image/png"
	"testing"
	"time"

	"sentinelflow/engine/internal/evaluator"
	"sentinelflow/engine/internal/marketstate"
)

func TestRenderPNGProducesDecodableProofImage(t *testing.T) {
	artifact, err := RenderPNG(Snapshot{
		Event: evaluator.Event{
			BucketStart: time.Date(2026, 7, 5, 6, 2, 0, 0, time.UTC),
			Message:     "BTCUSDT 1m buy stacked imbalance confirmed across 3 candles at 300% threshold.",
			RuleID:      "rule-1",
			RuleName:    "BTC 1m stacked imbalance",
			Side:        "buy",
			Symbol:      "BTCUSDT",
			Timeframe:   "1m",
		},
		Candles: []marketstate.Candle{
			{BucketStart: time.Date(2026, 7, 5, 6, 0, 0, 0, time.UTC), BuyVolume: 1.0, SellVolume: 0.2, Close: 104000.5, TotalVolume: 1.2},
			{BucketStart: time.Date(2026, 7, 5, 6, 1, 0, 0, time.UTC), BuyVolume: 1.1, SellVolume: 0.25, Close: 104020.5, TotalVolume: 1.35},
			{BucketStart: time.Date(2026, 7, 5, 6, 2, 0, 0, time.UTC), BuyVolume: 1.2, SellVolume: 0.3, Close: 104050.25, TotalVolume: 1.5},
		},
	})
	if err != nil {
		t.Fatalf("render png: %v", err)
	}

	if artifact.MediaType != PNGMediaType {
		t.Fatalf("unexpected media type: %s", artifact.MediaType)
	}

	if len(artifact.Bytes) == 0 || artifact.ContentHash == "" {
		t.Fatal("expected rasterized PNG to include bytes and a content hash")
	}

	config, err := png.DecodeConfig(bytes.NewReader(artifact.Bytes))
	if err != nil {
		t.Fatalf("decode png config: %v", err)
	}

	if config.Width != DefaultWidth || config.Height != DefaultHeight {
		t.Fatalf("unexpected png size: %dx%d", config.Width, config.Height)
	}
}

func TestRasterizeSVGRejectsInvalidInput(t *testing.T) {
	if _, err := RasterizeSVG("<svg><broken>", DefaultWidth, DefaultHeight); err == nil {
		t.Fatal("expected invalid svg to return an error")
	}
}

// TestRasterizeSVGActuallyDrawsTextPixels guards against the rasterizer
// silently dropping <text> content. oksvg/rasterx only understands vector
// shapes, so without an explicit text-drawing pass a proof PNG can decode
// fine and still be missing every label, price, and rule name - which is
// exactly what shipped to Telegram before this test existed. This renders a
// label over a known solid background and asserts non-background pixels
// exist in that label's bounding box, proving glyphs were actually painted.
func TestRasterizeSVGActuallyDrawsTextPixels(t *testing.T) {
	const bg = "#f4efe6"
	svg := `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80">` +
		`<rect width="100%" height="100%" fill="` + bg + `"/>` +
		`<text x="20" y="50" font-family="Arial" font-size="32" fill="#000000">HELLO</text>` +
		`</svg>`

	artifact, err := RasterizeSVG(svg, 200, 80)
	if err != nil {
		t.Fatalf("rasterize svg: %v", err)
	}

	img, err := png.Decode(bytes.NewReader(artifact.Bytes))
	if err != nil {
		t.Fatalf("decode png: %v", err)
	}

	backgroundColor := parseSVGColor(bg)
	bgR, bgG, bgB, _ := backgroundColor.RGBA()

	foundNonBackgroundPixel := false
	bounds := img.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y && !foundNonBackgroundPixel; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, _ := img.At(x, y).RGBA()
			if !colorsClose(r, g, b, bgR, bgG, bgB) {
				foundNonBackgroundPixel = true
				break
			}
		}
	}

	if !foundNonBackgroundPixel {
		t.Fatal("expected the rasterized PNG to contain drawn text pixels, but the image was solid background")
	}
}

func TestParseSVGTextNodesExtractsPositionStylingAndContent(t *testing.T) {
	svg := `<text x="10" y="20" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" fill="#123456">Hello &amp; World</text>`

	nodes := parseSVGTextNodes(svg)
	if len(nodes) != 1 {
		t.Fatalf("expected 1 text node, got %d", len(nodes))
	}

	node := nodes[0]
	if node.x != 10 || node.y != 20 {
		t.Fatalf("unexpected position: (%v, %v)", node.x, node.y)
	}
	if node.anchor != "middle" {
		t.Fatalf("unexpected anchor: %s", node.anchor)
	}
	if node.fontSize != 18 {
		t.Fatalf("unexpected font size: %v", node.fontSize)
	}
	if !node.bold {
		t.Fatal("expected bold from font-weight 700")
	}
	if node.fill != "#123456" {
		t.Fatalf("unexpected fill: %s", node.fill)
	}
	if node.content != "Hello & World" {
		t.Fatalf("expected html-unescaped content, got %q", node.content)
	}
}

func TestParseSVGTextNodesSkipsBlankContent(t *testing.T) {
	svg := `<text x="10" y="20" font-size="18" fill="#000">   </text>`

	if nodes := parseSVGTextNodes(svg); len(nodes) != 0 {
		t.Fatalf("expected blank text content to be skipped, got %d nodes", len(nodes))
	}
}

func TestParseSVGColorHandlesShortAndLongHex(t *testing.T) {
	shortForm := parseSVGColor("#fff").(color.RGBA)
	if shortForm.R != 255 || shortForm.G != 255 || shortForm.B != 255 {
		t.Fatalf("unexpected short-hex color: %+v", shortForm)
	}

	longForm := parseSVGColor("#138a5b").(color.RGBA)
	if longForm.R != 0x13 || longForm.G != 0x8a || longForm.B != 0x5b {
		t.Fatalf("unexpected long-hex color: %+v", longForm)
	}

	fallback := parseSVGColor("not-a-color").(color.RGBA)
	if fallback != (color.RGBA{A: 255}) {
		t.Fatalf("expected unrecognized color to fall back to opaque black, got %+v", fallback)
	}
}

func colorsClose(r1, g1, b1, r2, g2, b2 uint32) bool {
	const tolerance = 3000 // out of 65535 per channel
	diff := func(a, b uint32) uint32 {
		if a > b {
			return a - b
		}
		return b - a
	}
	return diff(r1, r2) < tolerance && diff(g1, g2) < tolerance && diff(b1, b2) < tolerance
}
