package telegram

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"sentinelflow/engine/internal/alerts"
	"sentinelflow/engine/internal/proof"
)

type Client struct {
	baseURL    string
	botToken   string
	httpClient *http.Client
}

func NewClient(baseURL string, botToken string) *Client {
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		botToken:   strings.TrimSpace(botToken),
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *Client) IsConfigured() bool {
	return c.baseURL != "" && c.botToken != ""
}

func (c *Client) SendAlertPhoto(
	ctx context.Context,
	chatID string,
	record alerts.Record,
	artifact proof.RasterizedArtifact,
) error {
	if !c.IsConfigured() {
		return fmt.Errorf("telegram client is not configured")
	}

	if len(artifact.Bytes) == 0 {
		return fmt.Errorf("telegram alert photo is empty")
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	if err := writer.WriteField("chat_id", chatID); err != nil {
		return fmt.Errorf("write chat_id field: %w", err)
	}

	if err := writer.WriteField("caption", FormatCaption(record)); err != nil {
		return fmt.Errorf("write caption field: %w", err)
	}

	fileWriter, err := writer.CreateFormFile("photo", "sentinel-flow-proof.png")
	if err != nil {
		return fmt.Errorf("create telegram photo file: %w", err)
	}

	if _, err := io.Copy(fileWriter, bytes.NewReader(artifact.Bytes)); err != nil {
		return fmt.Errorf("write telegram photo bytes: %w", err)
	}

	if err := writer.Close(); err != nil {
		return fmt.Errorf("close telegram multipart writer: %w", err)
	}

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		fmt.Sprintf("%s/bot%s/sendPhoto", c.baseURL, c.botToken),
		&body,
	)
	if err != nil {
		return fmt.Errorf("create telegram sendPhoto request: %w", err)
	}

	request.Header.Set("Content-Type", writer.FormDataContentType())

	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("send telegram photo request: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("telegram sendPhoto failed with status %d", response.StatusCode)
	}

	return nil
}
