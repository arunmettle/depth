// Package klines fetches real historical OHLC candles from Bybit's public
// v5 market-data REST API. It has no dependency on the live trade stream or
// any alert/store package so it can be shared by anything that needs to
// check what price actually did after a point in time (for example,
// resolving whether a trade plan's stop-loss or take-profit was touched).
package klines

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"time"
)

const (
	defaultBaseURL = "https://api.bybit.com"
	category       = "linear"
	pageLimit      = 1000
	maxPages       = 6
)

// Kline is one real historical candle.
type Kline struct {
	StartTime time.Time
	Open      float64
	High      float64
	Low       float64
	Close     float64
}

type Client struct {
	httpClient *http.Client
	baseURL    string
}

func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 10 * time.Second},
		baseURL:    defaultBaseURL,
	}
}

type response struct {
	RetCode int    `json:"retCode"`
	RetMsg  string `json:"retMsg"`
	Result  struct {
		List [][]string `json:"list"`
	} `json:"result"`
}

// FetchKlines returns real historical candles for symbol between start and
// end (ascending chronological order), paginating forward as needed.
// intervalMinutes must be one of Bybit's supported kline intervals (1, 5,
// 15, ...).
func (c *Client) FetchKlines(ctx context.Context, symbol string, intervalMinutes int, start time.Time, end time.Time) ([]Kline, error) {
	if symbol == "" {
		return nil, fmt.Errorf("symbol is required")
	}

	if !end.After(start) {
		return nil, fmt.Errorf("end must be after start")
	}

	var all []Kline
	cursor := start

	for page := 0; page < maxPages; page++ {
		batch, err := c.fetchPage(ctx, symbol, intervalMinutes, cursor, end)
		if err != nil {
			return nil, err
		}

		if len(batch) == 0 {
			break
		}

		all = append(all, batch...)

		last := batch[len(batch)-1].StartTime
		next := last.Add(time.Duration(intervalMinutes) * time.Minute)
		if !next.After(cursor) || !next.Before(end) {
			break
		}

		cursor = next
	}

	return all, nil
}

func (c *Client) fetchPage(ctx context.Context, symbol string, intervalMinutes int, start time.Time, end time.Time) ([]Kline, error) {
	endpoint, err := url.Parse(c.baseURL + "/v5/market/kline")
	if err != nil {
		return nil, fmt.Errorf("build kline endpoint: %w", err)
	}

	query := endpoint.Query()
	query.Set("category", category)
	query.Set("symbol", symbol)
	query.Set("interval", strconv.Itoa(intervalMinutes))
	query.Set("start", strconv.FormatInt(start.UnixMilli(), 10))
	query.Set("end", strconv.FormatInt(end.UnixMilli(), 10))
	query.Set("limit", strconv.Itoa(pageLimit))
	endpoint.RawQuery = query.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("create kline request: %w", err)
	}

	resp, err := c.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request klines: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("kline request failed with status %d", resp.StatusCode)
	}

	var payload response
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode kline response: %w", err)
	}

	if payload.RetCode != 0 {
		return nil, fmt.Errorf("bybit kline error: %s", payload.RetMsg)
	}

	out := make([]Kline, 0, len(payload.Result.List))
	for _, row := range payload.Result.List {
		kline, err := parseRow(row)
		if err != nil {
			continue
		}
		out = append(out, kline)
	}

	sort.Slice(out, func(i, j int) bool { return out[i].StartTime.Before(out[j].StartTime) })

	return out, nil
}

func parseRow(row []string) (Kline, error) {
	if len(row) < 5 {
		return Kline{}, fmt.Errorf("unexpected kline row length %d", len(row))
	}

	startMillis, err := strconv.ParseInt(row[0], 10, 64)
	if err != nil {
		return Kline{}, fmt.Errorf("parse kline start: %w", err)
	}

	open, err := strconv.ParseFloat(row[1], 64)
	if err != nil {
		return Kline{}, fmt.Errorf("parse kline open: %w", err)
	}

	high, err := strconv.ParseFloat(row[2], 64)
	if err != nil {
		return Kline{}, fmt.Errorf("parse kline high: %w", err)
	}

	low, err := strconv.ParseFloat(row[3], 64)
	if err != nil {
		return Kline{}, fmt.Errorf("parse kline low: %w", err)
	}

	closePrice, err := strconv.ParseFloat(row[4], 64)
	if err != nil {
		return Kline{}, fmt.Errorf("parse kline close: %w", err)
	}

	return Kline{
		StartTime: time.UnixMilli(startMillis).UTC(),
		Open:      open,
		High:      high,
		Low:       low,
		Close:     closePrice,
	}, nil
}
