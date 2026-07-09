// Package historicaldata downloads and parses Bybit's free, public,
// tick-by-tick historical trade archives
// (https://public.bybit.com/trading/{symbol}/{symbol}{date}.csv.gz) so
// rules can eventually be backtested against real multi-year trade history
// instead of only the last ~1,000 live trades.
//
// See docs/PROFITABILITY_AFTER_COSTS.md and
// VISUAL_PROOF_AND_BACKTEST_GOALS.md: the existing "recent replay" preview
// in the web app is explicitly not a real backtest. This package is the
// data foundation a real one needs - both live rule types
// (stacked_imbalance, trapped_traders) only ever consume trade
// price/side/size aggregated into candles, never raw order-book depth, so
// this archive alone is sufficient to replay them across years of history.
package historicaldata

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"sentinelflow/engine/internal/marketstate"
)

const (
	defaultBaseURL = "https://public.bybit.com/trading"

	// requestUserAgent mimics a real browser. Like Bybit's main trading API
	// (see internal/klines), the public data mirror can reject requests
	// carrying Go's default "Go-http-client" user agent from
	// datacenter/cloud egress IPs (e.g. Railway), even though the same IP
	// range is fine on the live WebSocket stream.
	requestUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

// Client downloads Bybit's public daily tick-trade archives.
type Client struct {
	httpClient *http.Client
	baseURL    string
}

func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 60 * time.Second},
		baseURL:    defaultBaseURL,
	}
}

// FetchDailyArchiveBytes downloads the raw gzip archive bytes for one UTC
// day of a symbol's tick trades, without parsing them. This is the layer
// callers should cache to disk, since Bybit's published archives never
// change once available and re-downloading years of history on every run
// is wasteful. Returns (nil, nil) when no archive exists for that
// symbol/day (e.g. before the symbol was listed) - that is not an error.
func (c *Client) FetchDailyArchiveBytes(ctx context.Context, symbol string, day time.Time) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.dailyArchiveURL(symbol, day), nil)
	if err != nil {
		return nil, fmt.Errorf("create historical trade request: %w", err)
	}
	request.Header.Set("User-Agent", requestUserAgent)

	resp, err := c.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request historical trades: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("historical trade request failed with status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read historical trade archive: %w", err)
	}

	return body, nil
}

// FetchDailyTrades downloads and parses one full UTC day of tick-by-tick
// trades for symbol, sorted ascending by timestamp. For repeated or
// multi-day use, prefer caching FetchDailyArchiveBytes to disk once and
// calling ParseDailyArchive locally on subsequent runs instead of
// re-downloading.
func (c *Client) FetchDailyTrades(ctx context.Context, symbol string, day time.Time) ([]marketstate.Trade, error) {
	body, err := c.FetchDailyArchiveBytes(ctx, symbol, day)
	if err != nil {
		return nil, err
	}

	if body == nil {
		return nil, nil
	}

	return ParseDailyArchive(body, symbol)
}

func (c *Client) dailyArchiveURL(symbol string, day time.Time) string {
	date := day.UTC().Format("2006-01-02")
	return fmt.Sprintf("%s/%s/%s%s.csv.gz", c.baseURL, symbol, symbol, date)
}

// ParseDailyArchive gunzips and parses one daily archive's raw bytes into
// trades, sorted ascending by timestamp (the archive itself is not
// guaranteed to be sorted).
func ParseDailyArchive(body []byte, symbol string) ([]marketstate.Trade, error) {
	gz, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("open gzip archive: %w", err)
	}
	defer gz.Close()

	trades, err := parseCSV(gz, symbol)
	if err != nil {
		return nil, err
	}

	sort.Slice(trades, func(i, j int) bool { return trades[i].Timestamp.Before(trades[j].Timestamp) })

	return trades, nil
}

// parseCSV parses Bybit's public trade archive CSV format:
//
//	timestamp,symbol,side,size,price,tickDirection,trdMatchID,grossValue,homeNotional,foreignNotional
//
// timestamp is a fractional Unix epoch in seconds (e.g. "1585180700.0647").
func parseCSV(r io.Reader, symbol string) ([]marketstate.Trade, error) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var trades []marketstate.Trade
	lineNumber := 0

	for scanner.Scan() {
		lineNumber++
		line := scanner.Text()

		if lineNumber == 1 {
			continue // header row
		}

		if strings.TrimSpace(line) == "" {
			continue
		}

		fields := strings.Split(line, ",")
		if len(fields) < 5 {
			continue
		}

		timestampSeconds, err := strconv.ParseFloat(fields[0], 64)
		if err != nil {
			continue
		}

		side := fields[2]

		size, err := strconv.ParseFloat(fields[3], 64)
		if err != nil {
			continue
		}

		price, err := strconv.ParseFloat(fields[4], 64)
		if err != nil {
			continue
		}

		trades = append(trades, marketstate.Trade{
			Price:     price,
			Side:      side,
			Size:      size,
			Symbol:    symbol,
			Timestamp: time.Unix(0, int64(timestampSeconds*float64(time.Second))).UTC(),
		})
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan trade archive: %w", err)
	}

	return trades, nil
}
