package app

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"sentinelflow/engine/internal/bybit"
	"sentinelflow/engine/internal/config"
)

func TestHandleHealthIncludesFreshnessSignal(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := bybit.NewPublicTradeStream(config.Config{
		BybitSymbols:  []string{"BTCUSDT"},
		PingInterval:  20 * time.Second,
	}, logger)
	now := time.Date(2026, 7, 6, 9, 45, 0, 0, time.UTC)
	streamStatusNow := now
	stream.SetNowForTests(func() time.Time { return streamStatusNow })
	stream.MarkConnectedForTests()
	stream.RecordMessageForTests()
	streamStatusNow = streamStatusNow.Add(41 * time.Second)

	application := New(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger, stream)

	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	recorder := httptest.NewRecorder()

	application.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected health response, got %d", recorder.Code)
	}

	var payload statusResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal health payload: %v", err)
	}

	if payload.Stream == nil {
		t.Fatal("expected stream payload")
	}

	if payload.Stream.Connected != true {
		t.Fatal("expected connected stream state")
	}

	if payload.Stream.Fresh {
		t.Fatal("expected stale stream freshness signal to be false")
	}
}

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

func TestHandleReadyReportsStaleStreamReason(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	stream := bybit.NewPublicTradeStream(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
		PingInterval: 20 * time.Second,
	}, logger)
	now := time.Date(2026, 7, 6, 10, 0, 0, 0, time.UTC)
	stream.SetNowForTests(func() time.Time { return now })
	stream.MarkConnectedForTests()
	stream.RecordMessageForTests()
	now = now.Add(41 * time.Second)

	application := New(config.Config{
		BybitSymbols: []string{"BTCUSDT"},
	}, logger, stream)

	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	recorder := httptest.NewRecorder()

	application.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected warming ready response, got %d", recorder.Code)
	}

	var payload statusResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal ready payload: %v", err)
	}

	if payload.Status != "warming" {
		t.Fatalf("expected warming status, got %s", payload.Status)
	}

	if payload.Reason != "stream-stale" {
		t.Fatalf("expected stream-stale reason, got %s", payload.Reason)
	}
}
