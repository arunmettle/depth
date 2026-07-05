package proof

import "testing"

func TestNewSVGArtifactBuildsStableMetadata(t *testing.T) {
	artifact := NewSVGArtifact("<svg>proof</svg>")

	if artifact.Content != "<svg>proof</svg>" {
		t.Fatalf("unexpected artifact content: %s", artifact.Content)
	}

	if artifact.MediaType != SVGMediaType {
		t.Fatalf("unexpected media type: %s", artifact.MediaType)
	}

	if artifact.Width != DefaultWidth || artifact.Height != DefaultHeight {
		t.Fatalf("unexpected artifact dimensions: %dx%d", artifact.Width, artifact.Height)
	}

	if artifact.ContentHash == "" {
		t.Fatal("expected content hash to be populated")
	}
}
