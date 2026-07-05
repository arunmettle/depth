package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Target struct {
	ChatID   string
	Username string
	UserID   string
}

type ConnectionSource struct {
	baseURL    string
	secretKey  string
	httpClient *http.Client
}

type telegramConnectionRow struct {
	TelegramChatID   string  `json:"telegram_chat_id"`
	TelegramUsername *string `json:"telegram_username"`
	UserID           string  `json:"user_id"`
}

func NewConnectionSource(projectURL string, secretKey string) *ConnectionSource {
	return &ConnectionSource{
		baseURL:    strings.TrimRight(strings.TrimSpace(projectURL), "/"),
		secretKey:  strings.TrimSpace(secretKey),
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (s *ConnectionSource) IsConfigured() bool {
	return s.baseURL != "" && s.secretKey != ""
}

func (s *ConnectionSource) Lookup(ctx context.Context, userID string) (*Target, error) {
	if !s.IsConfigured() {
		return nil, fmt.Errorf("telegram connection source is not configured")
	}

	endpoint, err := url.Parse(s.baseURL + "/rest/v1/telegram_connections")
	if err != nil {
		return nil, fmt.Errorf("build telegram_connections endpoint: %w", err)
	}

	query := endpoint.Query()
	query.Set("select", "user_id,telegram_chat_id,telegram_username")
	query.Set("user_id", "eq."+userID)
	query.Set("limit", "1")
	endpoint.RawQuery = query.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("create telegram connection request: %w", err)
	}

	request.Header.Set("apikey", s.secretKey)
	request.Header.Set("Authorization", "Bearer "+s.secretKey)
	request.Header.Set("Accept", "application/json")

	response, err := s.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request telegram connection: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("telegram connection request failed with status %d", response.StatusCode)
	}

	var rows []telegramConnectionRow
	if err := json.NewDecoder(response.Body).Decode(&rows); err != nil {
		return nil, fmt.Errorf("decode telegram connection response: %w", err)
	}

	if len(rows) == 0 || rows[0].TelegramChatID == "" || rows[0].UserID == "" {
		return nil, nil
	}

	username := ""
	if rows[0].TelegramUsername != nil {
		username = *rows[0].TelegramUsername
	}

	return &Target{
		ChatID:   rows[0].TelegramChatID,
		Username: username,
		UserID:   rows[0].UserID,
	}, nil
}
