package historicaldata

import (
	"bytes"
	"compress/gzip"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func gzipFixture(t *testing.T, csv string) []byte {
	t.Helper()

	var buf bytes.Buffer
	writer := gzip.NewWriter(&buf)
	if _, err := writer.Write([]byte(csv)); err != nil {
		t.Fatalf("write gzip fixture: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close gzip fixture: %v", err)
	}

	return buf.Bytes()
}

const sampleCSV = `timestamp,symbol,side,size,price,tickDirection,trdMatchID,grossValue,homeNotional,foreignNotional
1585180700.02,BTCUSDT,Buy,0.072,6698.0,PlusTick,a,1,1,1
1585180575.8594,BTCUSDT,Sell,0.009,6682.0,PlusTick,b,1,1,1
1585180700.0647,BTCUSDT,Buy,0.042,6698.5,PlusTick,c,1,1,1
,BTCUSDT,Buy,malformed,row,x,1,1,1
`

func TestParseDailyArchiveParsesAndSortsAscending(t *testing.T) {
	trades, err := ParseDailyArchive(gzipFixture(t, sampleCSV), "BTCUSDT")
	if err != nil {
		t.Fatalf("parse daily archive: %v", err)
	}

	if len(trades) != 3 {
		t.Fatalf("expected 3 valid trades (malformed row skipped), got %d", len(trades))
	}

	for i := 1; i < len(trades); i++ {
		if trades[i].Timestamp.Before(trades[i-1].Timestamp) {
			t.Fatalf("expected ascending timestamps, got %+v", trades)
		}
	}

	first := trades[0]
	if first.Side != "Sell" || first.Price != 6682.0 || first.Size != 0.009 || first.Symbol != "BTCUSDT" {
		t.Fatalf("unexpected first trade: %+v", first)
	}
}

func TestFetchDailyArchiveBytesReturnsNilOnNotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	client := &Client{httpClient: server.Client(), baseURL: server.URL}

	body, err := client.FetchDailyArchiveBytes(context.Background(), "BTCUSDT", time.Now())
	if err != nil {
		t.Fatalf("expected no error on 404, got %v", err)
	}
	if body != nil {
		t.Fatalf("expected nil body on 404, got %d bytes", len(body))
	}
}

func TestFetchDailyTradesUsesExpectedURLAndUserAgent(t *testing.T) {
	var gotPath, gotUserAgent string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotUserAgent = r.Header.Get("User-Agent")
		_, _ = w.Write(gzipFixture(t, sampleCSV))
	}))
	defer server.Close()

	client := &Client{httpClient: server.Client(), baseURL: server.URL}

	day := time.Date(2020, time.March, 25, 0, 0, 0, 0, time.UTC)
	trades, err := client.FetchDailyTrades(context.Background(), "BTCUSDT", day)
	if err != nil {
		t.Fatalf("fetch daily trades: %v", err)
	}

	if len(trades) != 3 {
		t.Fatalf("expected 3 trades, got %d", len(trades))
	}

	if gotPath != "/BTCUSDT/BTCUSDT2020-03-25.csv.gz" {
		t.Fatalf("unexpected request path: %s", gotPath)
	}

	if gotUserAgent == "" || gotUserAgent == "Go-http-client/1.1" {
		t.Fatalf("expected a browser-like user agent, got %q", gotUserAgent)
	}
}

func TestFetchDailyTradesPropagatesServerErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := &Client{httpClient: server.Client(), baseURL: server.URL}

	_, err := client.FetchDailyTrades(context.Background(), "BTCUSDT", time.Now())
	if err == nil {
		t.Fatal("expected an error for a 500 response")
	}
}
