package app

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"sentinelflow/engine/internal/bybit"
	"sentinelflow/engine/internal/config"
)

func TestHandleValidationAlertRequiresValidationKey(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := bybit.NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger)
	application := New(config.Config{
		BybitSymbols:     []string{"BTCUSDT"},
		ValidationAPIKey: "secret-123",
	}, logger, stream)

	request := httptest.NewRequest(http.MethodPost, "/internal/validate/alert", bytes.NewBufferString(`{}`))
	recorder := httptest.NewRecorder()

	application.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthorized response, got %d", recorder.Code)
	}
}

func TestHandleValidationAlertAcceptsValidRequest(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := bybit.NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger)
	application := New(config.Config{
		BybitSymbols:     []string{"BTCUSDT"},
		ValidationAPIKey: "secret-123",
	}, logger, stream)

	body, err := json.Marshal(map[string]string{
		"marketSymbol": "BTCUSDT",
		"side":         "buy",
		"timeframe":    "1m",
		"userId":       "user-6",
	})
	if err != nil {
		t.Fatalf("marshal validation alert payload: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/internal/validate/alert", bytes.NewReader(body))
	request.Header.Set("x-validation-key", "secret-123")
	recorder := httptest.NewRecorder()

	application.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusAccepted {
		t.Fatalf("expected accepted response, got %d", recorder.Code)
	}

	status := stream.Status()
	if len(status.Evaluator.RecentAlerts) != 1 {
		t.Fatalf("expected one validation alert record, got %d", len(status.Evaluator.RecentAlerts))
	}
}
