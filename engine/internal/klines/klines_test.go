package klines

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestFetchKlinesParsesAndSortsAscending(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("category") != "linear" {
			t.Fatalf("expected category=linear, got %s", r.URL.RawQuery)
		}
		if r.URL.Query().Get("symbol") != "BTCUSDT" {
			t.Fatalf("expected symbol=BTCUSDT, got %s", r.URL.RawQuery)
		}
		if r.URL.Query().Get("interval") != "1" {
			t.Fatalf("expected interval=1, got %s", r.URL.RawQuery)
		}

		// Bybit returns newest-first; the client must sort ascending.
		body := map[string]any{
			"retCode": 0,
			"retMsg":  "OK",
			"result": map[string]any{
				"list": [][]string{
					{"1000120000", "101", "102", "100.5", "101.5", "10", "1000"},
					{"1000060000", "100", "101", "99.5", "100.5", "10", "1000"},
				},
			},
		}
		_ = json.NewEncoder(w).Encode(body)
	}))
	defer server.Close()

	client := &Client{httpClient: server.Client(), baseURL: server.URL}

	start := time.UnixMilli(1000000000).UTC()
	end := time.UnixMilli(1000150000).UTC()

	got, err := client.FetchKlines(context.Background(), "BTCUSDT", 1, start, end)
	if err != nil {
		t.Fatalf("fetch klines: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("expected 2 klines, got %d", len(got))
	}

	if !got[0].StartTime.Before(got[1].StartTime) {
		t.Fatalf("expected ascending order, got %+v", got)
	}

	if got[0].High != 101 || got[1].Low != 100.5 {
		t.Fatalf("unexpected parsed values: %+v", got)
	}
}

func TestFetchKlinesRejectsInvalidRange(t *testing.T) {
	client := NewClient()

	_, err := client.FetchKlines(context.Background(), "BTCUSDT", 1, time.Now(), time.Now().Add(-time.Hour))
	if err == nil {
		t.Fatal("expected error when end is before start")
	}

	_, err = client.FetchKlines(context.Background(), "", 1, time.Now(), time.Now().Add(time.Hour))
	if err == nil {
		t.Fatal("expected error when symbol is empty")
	}
}

func TestFetchKlinesSetsBrowserLikeUserAgent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") == "" || r.Header.Get("User-Agent") == "Go-http-client/1.1" {
			t.Fatalf("expected a browser-like user agent, got %q", r.Header.Get("User-Agent"))
		}
		body := map[string]any{"retCode": 0, "retMsg": "OK", "result": map[string]any{"list": [][]string{}}}
		_ = json.NewEncoder(w).Encode(body)
	}))
	defer server.Close()

	client := &Client{httpClient: server.Client(), baseURL: server.URL}

	if _, err := client.FetchKlines(context.Background(), "BTCUSDT", 1, time.UnixMilli(0).UTC(), time.UnixMilli(60000).UTC()); err != nil {
		t.Fatalf("fetch klines: %v", err)
	}
}

func TestFetchKlinesFallsBackToMirrorDomainOn403(t *testing.T) {
	mirror := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{
			"retCode": 0,
			"retMsg":  "OK",
			"result": map[string]any{
				"list": [][]string{
					{"1000060000", "100", "101", "99.5", "100.5", "10", "1000"},
				},
			},
		}
		_ = json.NewEncoder(w).Encode(body)
	}))
	defer mirror.Close()

	blocked := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer blocked.Close()

	client := &Client{httpClient: blocked.Client(), baseURL: blocked.URL}
	origFallbacks := fallbackBaseURLs
	fallbackBaseURLs = []string{mirror.URL}
	defer func() { fallbackBaseURLs = origFallbacks }()

	got, err := client.FetchKlines(context.Background(), "BTCUSDT", 1, time.UnixMilli(1000000000).UTC(), time.UnixMilli(1000090000).UTC())
	if err != nil {
		t.Fatalf("expected fallback domain to succeed after primary 403, got error: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 kline from mirror domain, got %d", len(got))
	}
}

func TestFetchKlinesReturnsErrorOnRetCode(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{"retCode": 10001, "retMsg": "invalid symbol", "result": map[string]any{"list": [][]string{}}}
		_ = json.NewEncoder(w).Encode(body)
	}))
	defer server.Close()

	client := &Client{httpClient: server.Client(), baseURL: server.URL}

	_, err := client.FetchKlines(context.Background(), "BTCUSDT", 1, time.Now().Add(-time.Hour), time.Now())
	if err == nil {
		t.Fatal("expected error when bybit returns a non-zero retCode")
	}
}
