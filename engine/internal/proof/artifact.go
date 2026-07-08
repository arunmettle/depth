package proof

import (
	"crypto/sha256"
	"encoding/hex"
)

const (
	DefaultHeight = 1040
	DefaultWidth  = 720
	SVGMediaType  = "image/svg+xml"
)

type Artifact struct {
	Content     string `json:"content"`
	ContentHash string `json:"contentHash"`
	Height      int    `json:"height"`
	MediaType   string `json:"mediaType"`
	Width       int    `json:"width"`
}

func NewSVGArtifact(content string) Artifact {
	hash := sha256.Sum256([]byte(content))

	return Artifact{
		Content:     content,
		ContentHash: hex.EncodeToString(hash[:]),
		Height:      DefaultHeight,
		MediaType:   SVGMediaType,
		Width:       DefaultWidth,
	}
}
