package proof

import (
	"bytes"
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
