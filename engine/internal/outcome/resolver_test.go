package outcome

import (
	"context"
	"errors"
	"testing"
	"time"

	"sentinelflow/engine/internal/klines"
)

type fakeKlineFetcher struct {
	klines []klines.Kline
	err    error
}

func (f *fakeKlineFetcher) FetchKlines(_ context.Context, _ string, _ int, _ time.Time, _ time.Time) ([]klines.Kline, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.klines, nil
}

type fakeAlertStore struct {
	pending []PendingAlert
	updates []Result
	err     error
}

func (f *fakeAlertStore) PendingOutcomeAlerts(_ context.Context, _ time.Duration, _ int) ([]PendingAlert, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.pending, nil
}

func (f *fakeAlertStore) UpdateOutcome(_ context.Context, result Result) error {
	f.updates = append(f.updates, result)
	return nil
}

func buyAlert(createdAt time.Time) PendingAlert {
	return PendingAlert{
		ID:           "alert-1",
		MarketSymbol: "BTCUSDT",
		Side:         "buy",
		Timeframe:    "1m",
		CreatedAt:    createdAt,
		EntryPrice:   100,
		StopLoss:     99,
		TakeProfit1:  101,
		TakeProfit2:  102,
	}
}

func TestResolvePendingMarksTakeProfit1HitWhenHighReachesLevel(t *testing.T) {
	createdAt := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	fetcher := &fakeKlineFetcher{klines: []klines.Kline{
		{StartTime: createdAt.Add(time.Minute), Open: 100, High: 100.5, Low: 99.8, Close: 100.2},
		{StartTime: createdAt.Add(2 * time.Minute), Open: 100.2, High: 101.2, Low: 100.1, Close: 101},
	}}
	store := &fakeAlertStore{pending: []PendingAlert{buyAlert(createdAt)}}

	resolver := NewResolver(fetcher, store, nil)
	resolver.now = func() time.Time { return createdAt.Add(10 * time.Minute) }

	if err := resolver.ResolvePending(context.Background()); err != nil {
		t.Fatalf("resolve pending: %v", err)
	}

	if len(store.updates) != 1 {
		t.Fatalf("expected 1 update, got %d", len(store.updates))
	}

	got := store.updates[0]
	if got.Status != StatusTP1Hit {
		t.Fatalf("expected tp1_hit, got %s", got.Status)
	}
	if got.RMultiple != 1 {
		t.Fatalf("expected r-multiple 1, got %v", got.RMultiple)
	}
}

func TestResolvePendingPrefersStopWhenBothBreachedSameCandle(t *testing.T) {
	createdAt := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	fetcher := &fakeKlineFetcher{klines: []klines.Kline{
		// A single wild candle that touches both stop and TP1 - we cannot
		// know which happened first, so the conservative (stop) outcome
		// must win.
		{StartTime: createdAt.Add(time.Minute), Open: 100, High: 101.5, Low: 98.5, Close: 100},
	}}
	store := &fakeAlertStore{pending: []PendingAlert{buyAlert(createdAt)}}

	resolver := NewResolver(fetcher, store, nil)
	resolver.now = func() time.Time { return createdAt.Add(10 * time.Minute) }

	if err := resolver.ResolvePending(context.Background()); err != nil {
		t.Fatalf("resolve pending: %v", err)
	}

	if len(store.updates) != 1 || store.updates[0].Status != StatusStopHit {
		t.Fatalf("expected stop_hit as the conservative outcome, got %+v", store.updates)
	}

	if store.updates[0].RMultiple != -1 {
		t.Fatalf("expected r-multiple -1 for a stop hit, got %v", store.updates[0].RMultiple)
	}
}

func TestResolvePendingMarksExpiredAfterWindowWithNoHit(t *testing.T) {
	createdAt := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	fetcher := &fakeKlineFetcher{klines: []klines.Kline{
		{StartTime: createdAt.Add(time.Minute), Open: 100, High: 100.2, Low: 99.9, Close: 100.1},
	}}
	store := &fakeAlertStore{pending: []PendingAlert{buyAlert(createdAt)}}

	resolver := NewResolver(fetcher, store, nil)
	resolver.now = func() time.Time { return createdAt.Add(49 * time.Hour) }

	if err := resolver.ResolvePending(context.Background()); err != nil {
		t.Fatalf("resolve pending: %v", err)
	}

	if len(store.updates) != 1 || store.updates[0].Status != StatusExpired {
		t.Fatalf("expected expired outcome, got %+v", store.updates)
	}

	if store.updates[0].Note == "" || store.updates[0].Note == "No recorded Bybit price history was available to check this alert's outcome." {
		t.Fatalf("expected a 'no level reached' note (candles were available), got %q", store.updates[0].Note)
	}
}

func TestResolvePendingMarksExpiredWithHonestNoteWhenNoCandlesWereEverRecorded(t *testing.T) {
	createdAt := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	fetcher := &fakeKlineFetcher{klines: nil}
	store := &fakeAlertStore{pending: []PendingAlert{buyAlert(createdAt)}}

	resolver := NewResolver(fetcher, store, nil)
	resolver.now = func() time.Time { return createdAt.Add(49 * time.Hour) }

	if err := resolver.ResolvePending(context.Background()); err != nil {
		t.Fatalf("resolve pending: %v", err)
	}

	if len(store.updates) != 1 || store.updates[0].Status != StatusExpired {
		t.Fatalf("expected expired outcome, got %+v", store.updates)
	}

	want := "No recorded Bybit price history was available to check this alert's outcome."
	if store.updates[0].Note != want {
		t.Fatalf("expected honest no-data note %q, got %q", want, store.updates[0].Note)
	}
}

func TestResolvePendingLeavesAlertPendingWithinWindowAndNoHit(t *testing.T) {
	createdAt := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	fetcher := &fakeKlineFetcher{klines: []klines.Kline{
		{StartTime: createdAt.Add(time.Minute), Open: 100, High: 100.2, Low: 99.9, Close: 100.1},
	}}
	store := &fakeAlertStore{pending: []PendingAlert{buyAlert(createdAt)}}

	resolver := NewResolver(fetcher, store, nil)
	resolver.now = func() time.Time { return createdAt.Add(10 * time.Minute) }

	if err := resolver.ResolvePending(context.Background()); err != nil {
		t.Fatalf("resolve pending: %v", err)
	}

	if len(store.updates) != 0 {
		t.Fatalf("expected no update while still pending, got %+v", store.updates)
	}
}

func TestResolvePendingHandlesSellSideTakeProfitAndStop(t *testing.T) {
	createdAt := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	sell := PendingAlert{
		ID: "alert-sell", MarketSymbol: "ETHUSDT", Side: "sell", Timeframe: "5m",
		CreatedAt: createdAt, EntryPrice: 100, StopLoss: 101, TakeProfit1: 99, TakeProfit2: 98,
	}
	fetcher := &fakeKlineFetcher{klines: []klines.Kline{
		{StartTime: createdAt.Add(5 * time.Minute), Open: 100, High: 100.2, Low: 97.9, Close: 98.2},
	}}
	store := &fakeAlertStore{pending: []PendingAlert{sell}}

	resolver := NewResolver(fetcher, store, nil)
	resolver.now = func() time.Time { return createdAt.Add(10 * time.Minute) }

	if err := resolver.ResolvePending(context.Background()); err != nil {
		t.Fatalf("resolve pending: %v", err)
	}

	if len(store.updates) != 1 || store.updates[0].Status != StatusTP2Hit {
		t.Fatalf("expected tp2_hit for sell side, got %+v", store.updates)
	}
	if store.updates[0].RMultiple != 2 {
		t.Fatalf("expected r-multiple 2 for sell TP2, got %v", store.updates[0].RMultiple)
	}
}

func TestResolvePendingContinuesAfterOneAlertFailsToFetch(t *testing.T) {
	createdAt := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	store := &fakeAlertStore{pending: []PendingAlert{buyAlert(createdAt)}}
	fetcher := &fakeKlineFetcher{err: errors.New("network error")}

	resolver := NewResolver(fetcher, store, nil)
	resolver.now = func() time.Time { return createdAt.Add(10 * time.Minute) }

	if err := resolver.ResolvePending(context.Background()); err != nil {
		t.Fatalf("expected ResolvePending to swallow per-alert errors, got %v", err)
	}

	if len(store.updates) != 0 {
		t.Fatalf("expected no updates when fetch fails, got %+v", store.updates)
	}
}

func TestResolvePendingPropagatesStoreLoadError(t *testing.T) {
	store := &fakeAlertStore{err: errors.New("db down")}
	resolver := NewResolver(&fakeKlineFetcher{}, store, nil)

	if err := resolver.ResolvePending(context.Background()); err == nil {
		t.Fatal("expected error when the store fails to load pending alerts")
	}
}
