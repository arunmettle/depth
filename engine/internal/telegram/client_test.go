package telegram

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"sentinelflow/engine/internal/alerts"
	"sentinelflow/engine/internal/proof"
)

func TestSendAlertPhotoPostsMultipartTelegramRequest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/bottoken-123/sendPhoto" {
			t.Fatalf("unexpected telegram path: %s", request.URL.Path)
		}

		reader, err := request.MultipartReader()
		if err != nil {
			t.Fatalf("multipart reader: %v", err)
		}

		fields := map[string]string{}
		var photoBytes []byte

		for {
			part, err := reader.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				t.Fatalf("next multipart part: %v", err)
			}

			bytes, err := io.ReadAll(part)
			if err != nil {
				t.Fatalf("read part bytes: %v", err)
			}

			if part.FormName() == "photo" {
				photoBytes = bytes
				continue
			}

			fields[part.FormName()] = string(bytes)
		}

		if fields["chat_id"] != "12345" {
			t.Fatalf("unexpected chat_id: %s", fields["chat_id"])
		}

		if !strings.Contains(fields["caption"], "BTCUSDT BUY 1m") {
			t.Fatalf("unexpected caption: %s", fields["caption"])
		}

		if len(photoBytes) == 0 {
			t.Fatal("expected uploaded photo bytes")
		}

		writer.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewClient(server.URL, "token-123")
	record := alerts.Record{
		CreatedAt:      time.Date(2026, 7, 5, 6, 2, 0, 0, time.UTC),
		DeliveryStatus: alerts.StatusEvaluated,
		ID:             "record-1",
		MarketSymbol:   "BTCUSDT",
		Message:        "BTCUSDT 1m buy stacked imbalance confirmed.",
		Proof:          proof.NewSVGArtifact("<svg></svg>"),
		RuleName:       "BTC 1m stacked imbalance",
		Side:           "buy",
		Timeframe:      "1m",
	}

	err := client.SendAlertPhoto(context.Background(), "12345", record, proof.RasterizedArtifact{
		Bytes:       []byte("png-bytes"),
		ContentHash: "hash",
		Height:      960,
		MediaType:   proof.PNGMediaType,
		Width:       720,
	})
	if err != nil {
		t.Fatalf("send alert photo: %v", err)
	}
}

func TestSendAlertPhotoRejectsUnconfiguredClient(t *testing.T) {
	client := NewClient("", "")
	err := client.SendAlertPhoto(context.Background(), "12345", alerts.Record{}, proof.RasterizedArtifact{})
	if err == nil {
		t.Fatal("expected unconfigured telegram client to fail")
	}
}
