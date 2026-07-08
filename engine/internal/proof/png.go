package proof

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"html"
	"image"
	"image/color"
	"image/png"
	"regexp"
	"strconv"
	"strings"

	"github.com/srwiley/oksvg"
	"github.com/srwiley/rasterx"
	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/goregular"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
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

	// oksvg/rasterx only rasterizes vector shapes: it silently drops every
	// <text> element. Without this step the PNG sent to Telegram would be
	// bars and boxes with no labels, prices, or rule names at all, so we
	// draw the real text content ourselves using Go's bundled TrueType
	// faces at the same coordinates the SVG specifies.
	if err := drawSVGText(imageBuffer, svg); err != nil {
		return RasterizedArtifact{}, fmt.Errorf("draw svg text: %w", err)
	}

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

var (
	svgTextElementPattern = regexp.MustCompile(`(?s)<text([^>]*)>(.*?)</text>`)
	svgAttrPattern        = regexp.MustCompile(`([\w-]+)="([^"]*)"`)
)

type svgTextNode struct {
	anchor   string
	bold     bool
	content  string
	fill     string
	fontSize float64
	x        float64
	y        float64
}

// parseSVGTextNodes extracts the position, styling, and real text content of
// every <text> element in the rendered SVG so it can be drawn onto the
// rasterized PNG, which the shape-only SVG rasterizer cannot do itself.
func parseSVGTextNodes(svg string) []svgTextNode {
	matches := svgTextElementPattern.FindAllStringSubmatch(svg, -1)
	nodes := make([]svgTextNode, 0, len(matches))

	for _, match := range matches {
		node := svgTextNode{
			anchor:   "start",
			fill:     "#000000",
			fontSize: 16,
		}

		for _, attr := range svgAttrPattern.FindAllStringSubmatch(match[1], -1) {
			key, value := attr[1], attr[2]
			switch key {
			case "x":
				node.x, _ = strconv.ParseFloat(value, 64)
			case "y":
				node.y, _ = strconv.ParseFloat(value, 64)
			case "font-size":
				node.fontSize, _ = strconv.ParseFloat(value, 64)
			case "font-weight":
				node.bold = value == "700" || value == "bold"
			case "fill":
				node.fill = value
			case "text-anchor":
				node.anchor = value
			}
		}

		node.content = html.UnescapeString(match[2])
		if strings.TrimSpace(node.content) == "" {
			continue
		}

		nodes = append(nodes, node)
	}

	return nodes
}

var (
	goRegularFont *opentype.Font
	goBoldFont    *opentype.Font
)

func init() {
	var err error
	goRegularFont, err = opentype.Parse(goregular.TTF)
	if err != nil {
		panic(fmt.Errorf("parse embedded regular font: %w", err))
	}
	goBoldFont, err = opentype.Parse(gobold.TTF)
	if err != nil {
		panic(fmt.Errorf("parse embedded bold font: %w", err))
	}
}

func fontFaceForNode(node svgTextNode) (font.Face, error) {
	source := goRegularFont
	if node.bold {
		source = goBoldFont
	}

	return opentype.NewFace(source, &opentype.FaceOptions{
		Size:    node.fontSize,
		DPI:     72,
		Hinting: font.HintingFull,
	})
}

// drawSVGText draws every <text> element found in svg directly onto img,
// matching the SVG's baseline positioning and text-anchor alignment as
// closely as a raster font drawer allows.
func drawSVGText(img *image.RGBA, svg string) error {
	for _, node := range parseSVGTextNodes(svg) {
		face, err := fontFaceForNode(node)
		if err != nil {
			return err
		}

		drawer := &font.Drawer{
			Dst:  img,
			Src:  image.NewUniform(parseSVGColor(node.fill)),
			Face: face,
		}

		x := node.x
		switch node.anchor {
		case "middle":
			x -= float64(drawer.MeasureString(node.content)>>6) / 2
		case "end":
			x -= float64(drawer.MeasureString(node.content) >> 6)
		}

		drawer.Dot = fixed.Point26_6{
			X: fixed.I(int(x)),
			Y: fixed.I(int(node.y)),
		}
		drawer.DrawString(node.content)

		if closer, ok := face.(interface{ Close() error }); ok {
			_ = closer.Close()
		}
	}

	return nil
}

// parseSVGColor parses the small set of color formats used in svg.go: 3 and
// 6-digit hex. It defaults to opaque black for anything unrecognized so a
// styling miss never silently drops a text label.
func parseSVGColor(value string) color.Color {
	hexValue := strings.TrimPrefix(value, "#")

	var r, g, b uint8
	switch len(hexValue) {
	case 3:
		r = hexDigitPair(hexValue[0], hexValue[0])
		g = hexDigitPair(hexValue[1], hexValue[1])
		b = hexDigitPair(hexValue[2], hexValue[2])
	case 6:
		r = hexDigitPair(hexValue[0], hexValue[1])
		g = hexDigitPair(hexValue[2], hexValue[3])
		b = hexDigitPair(hexValue[4], hexValue[5])
	default:
		return color.RGBA{A: 255}
	}

	return color.RGBA{R: r, G: g, B: b, A: 255}
}

func hexDigitPair(high byte, low byte) uint8 {
	value, err := strconv.ParseUint(string([]byte{high, low}), 16, 8)
	if err != nil {
		return 0
	}
	return uint8(value)
}
