package proof

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	"image/png"
	"strings"

	"github.com/srwiley/oksvg"
	"github.com/srwiley/rasterx"
)

const PNGMediaType = "image/png"

type RasterizedArtifact struct {
	Bytes       []byte
	ContentHash string
	Height      int
	MediaType   string
	Width       int
}

func RenderPNG(snapshot Snapshot) (RasterizedArtifact, error) {
	svg := RenderSVG(snapshot)
	return RasterizeSVG(svg, DefaultWidth, DefaultHeight)
}

func RasterizeSVG(svg string, width int, height int) (RasterizedArtifact, error) {
	if width <= 0 || height <= 0 {
		return RasterizedArtifact{}, fmt.Errorf("invalid raster size %dx%d", width, height)
	}

	icon, err := oksvg.ReadIconStream(strings.NewReader(svg))
	if err != nil {
		return RasterizedArtifact{}, fmt.Errorf("read svg icon: %w", err)
	}

	icon.SetTarget(0, 0, float64(width), float64(height))

	imageBuffer := image.NewRGBA(image.Rect(0, 0, width, height))
	scanner := rasterx.NewScannerGV(width, height, imageBuffer, imageBuffer.Bounds())
	dasher := rasterx.NewDasher(width, height, scanner)
	icon.Draw(dasher, 1)

	var output bytes.Buffer
	if err := png.Encode(&output, imageBuffer); err != nil {
		return RasterizedArtifact{}, fmt.Errorf("encode png: %w", err)
	}

	content := output.Bytes()
	hash := sha256.Sum256(content)

	return RasterizedArtifact{
		Bytes:       content,
		ContentHash: hex.EncodeToString(hash[:]),
		Height:      height,
		MediaType:   PNGMediaType,
		Width:       width,
	}, nil
}
