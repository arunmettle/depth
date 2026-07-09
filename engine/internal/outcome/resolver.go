// Package outcome resolves whether a delivered alert's trade plan would
// actually have been profitable, using only real subsequent price history
// (never fabricated or estimated data). For each pending alert it fetches
// real historical candles after the alert fired and checks, in
// chronological order, whether the stop-loss or a take-profit level was
// genuinely touched first.
package outcome

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"time"

	"sentinelflow/engine/internal/klines"
)

type Status string

const (
	StatusPending Status = "pending"
	StatusTP1Hit  Status = "tp1_hit"
	StatusTP2Hit  Status = "tp2_hit"
	StatusStopHit Status = "stop_hit"
	StatusExpired Status = "expired"
)

const (
	// DefaultResolutionWindow bounds how long we keep checking an alert for
	// a real outcome before giving up and marking it expired. This keeps
	// the pending queue bounded and avoids implying an alert is still
	// "live" indefinitely. Exported so engine/internal/backtest can apply
	// the exact same cutoff to historical signals - without it, a
	// backtest could credit a "win" to a signal that only resolved days
	// later, a outcome live alerting would have already marked expired.
	DefaultResolutionWindow = 48 * time.Hour

	// defaultMinAge ensures at least one candle has had a chance to close
	// after the alert fired before we bother fetching klines for it.
	defaultMinAge = 2 * time.Minute

	// defaultBatchLimit bounds how many pending alerts we check per pass.
	// PendingOutcomeAlerts always orders oldest-first, so a small limit
	// here previously meant a large backlog of old alerts with no
	// resolvable price history (e.g. predating real-time candle
	// recording) permanently starved newer, resolvable alerts of ever
	// being checked at all - they never advanced past the oldest N stuck
	// in "pending" limbo. Now that resolution reads from our own
	// self-recorded candle_history table (a cheap internal query, not a
	// rate-limited external API), we can afford to check far more per
	// pass so the whole pending queue keeps moving.
	defaultBatchLimit = 500
)

// PendingAlert is the minimal trade-plan data needed to resolve a real
// outcome for one previously delivered alert.
type PendingAlert struct {
	ID           string
	MarketSymbol string
	Side         string // "buy" or "sell"
	Timeframe    string // "1m", "5m", "15m"
	CreatedAt    time.Time
	EntryPrice   float64
	StopLoss     float64
	TakeProfit1  float64
	TakeProfit2  float64
}

// Result is the resolved (or still-pending/expired) outcome for one alert.
type Result struct {
	AlertID   string
	Status    Status
	HitPrice  float64
	HitAt     time.Time
	RMultiple float64
	Note      string
}

// KlineFetcher fetches real historical candles. Satisfied by
// *klines.Client.
type KlineFetcher interface {
	FetchKlines(ctx context.Context, symbol string, intervalMinutes int, start time.Time, end time.Time) ([]klines.Kline, error)
}

// AlertStore is the persistence boundary the resolver needs: read alerts
// still waiting for a real outcome, and write back a resolved (or expired)
// outcome.
type AlertStore interface {
	PendingOutcomeAlerts(ctx context.Context, minAge time.Duration, limit int) ([]PendingAlert, error)
	UpdateOutcome(ctx context.Context, result Result) error
}

type Resolver struct {
	klines           KlineFetcher
	store            AlertStore
	logger           *slog.Logger
	now              func() time.Time
	resolutionWindow time.Duration
	minAge           time.Duration
	batchLimit       int
}

func NewResolver(klineFetcher KlineFetcher, store AlertStore, logger *slog.Logger) *Resolver {
	return &Resolver{
		klines:           klineFetcher,
		store:            store,
		logger:           logger,
		now:              time.Now,
		resolutionWindow: DefaultResolutionWindow,
		minAge:           defaultMinAge,
		batchLimit:       defaultBatchLimit,
	}
}

// ResolvePending checks all alerts still waiting for a real outcome and
// persists any that can now be resolved (hit, or expired with no clear
// outcome).
func (r *Resolver) ResolvePending(ctx context.Context) error {
	pending, err := r.store.PendingOutcomeAlerts(ctx, r.minAge, r.batchLimit)
	if err != nil {
		return fmt.Errorf("load pending outcome alerts: %w", err)
	}

	for _, alert := range pending {
		result, err := r.resolveOne(ctx, alert)
		if err != nil {
			if r.logger != nil {
				r.logger.Warn("outcome resolution failed",
					slog.String("alert_id", alert.ID),
					slog.String("symbol", alert.MarketSymbol),
					slog.Any("error", err),
				)
			}
			continue
		}

		if result.Status == StatusPending {
			continue
		}

		if err := r.store.UpdateOutcome(ctx, result); err != nil {
			if r.logger != nil {
				r.logger.Warn("persisting outcome failed",
					slog.String("alert_id", alert.ID),
					slog.String("status", string(result.Status)),
					slog.Any("error", err),
				)
			}
		}
	}

	return nil
}

func (r *Resolver) resolveOne(ctx context.Context, alert PendingAlert) (Result, error) {
	intervalMinutes, ok := timeframeMinutes(alert.Timeframe)
	if !ok {
		return Result{
			AlertID: alert.ID,
			Status:  StatusExpired,
			Note:    fmt.Sprintf("Unsupported timeframe %q for outcome resolution.", alert.Timeframe),
		}, nil
	}

	now := r.now()
	windowEnd := alert.CreatedAt.Add(r.resolutionWindow)

	fetchEnd := windowEnd
	if now.Before(fetchEnd) {
		fetchEnd = now
	}

	if !fetchEnd.After(alert.CreatedAt) {
		return Result{AlertID: alert.ID, Status: StatusPending}, nil
	}

	candles, err := r.klines.FetchKlines(ctx, alert.MarketSymbol, intervalMinutes, alert.CreatedAt, fetchEnd)
	if err != nil {
		return Result{}, err
	}

	for _, candle := range candles {
		if result, hit := EvaluateCandle(alert, candle); hit {
			return result, nil
		}
	}

	if now.After(windowEnd) {
		note := fmt.Sprintf("No stop-loss or take-profit level was reached within %s of the alert.", r.resolutionWindow)
		if len(candles) == 0 {
			// We fetched the complete resolution window and found zero
			// recorded candles - this alert predates (or fell in a gap
			// of) our own real-time candle recording, so we genuinely
			// have no price history to check it against. Say so plainly
			// rather than implying we checked and nothing was hit.
			note = "No recorded Bybit price history was available to check this alert's outcome."
		}

		return Result{
			AlertID: alert.ID,
			Status:  StatusExpired,
			Note:    note,
		}, nil
	}

	return Result{AlertID: alert.ID, Status: StatusPending}, nil
}

// EvaluateCandle checks a single real candle against the trade plan. If
// both a stop and a take-profit level are breached within the same candle,
// the stop always wins: we cannot know the true intra-candle order, and
// assuming the worse outcome keeps the track record honest rather than
// overclaiming wins. Likewise TP2 is only reported once TP1 has genuinely
// been passed.
//
// Exported so the historical backtest runner (engine/internal/backtest) can
// resolve outcomes for simulated historical alerts using the exact same
// stop/TP hit-order logic real, live-delivered alerts are resolved with -
// deliberately avoiding a second, potentially drifting implementation of
// this rule.
func EvaluateCandle(alert PendingAlert, candle klines.Kline) (Result, bool) {
	isSell := strings.EqualFold(alert.Side, "sell")

	var stopBreached, tp1Breached, tp2Breached bool

	if isSell {
		stopBreached = alert.StopLoss > 0 && candle.High >= alert.StopLoss
		tp1Breached = alert.TakeProfit1 > 0 && candle.Low <= alert.TakeProfit1
		tp2Breached = alert.TakeProfit2 > 0 && candle.Low <= alert.TakeProfit2
	} else {
		stopBreached = alert.StopLoss > 0 && candle.Low <= alert.StopLoss
		tp1Breached = alert.TakeProfit1 > 0 && candle.High >= alert.TakeProfit1
		tp2Breached = alert.TakeProfit2 > 0 && candle.High >= alert.TakeProfit2
	}

	switch {
	case stopBreached:
		return Result{
			AlertID:   alert.ID,
			Status:    StatusStopHit,
			HitPrice:  alert.StopLoss,
			HitAt:     candle.StartTime,
			RMultiple: computeRMultiple(alert, alert.StopLoss),
		}, true
	case tp2Breached:
		return Result{
			AlertID:   alert.ID,
			Status:    StatusTP2Hit,
			HitPrice:  alert.TakeProfit2,
			HitAt:     candle.StartTime,
			RMultiple: computeRMultiple(alert, alert.TakeProfit2),
		}, true
	case tp1Breached:
		return Result{
			AlertID:   alert.ID,
			Status:    StatusTP1Hit,
			HitPrice:  alert.TakeProfit1,
			HitAt:     candle.StartTime,
			RMultiple: computeRMultiple(alert, alert.TakeProfit1),
		}, true
	default:
		return Result{}, false
	}
}

func computeRMultiple(alert PendingAlert, exitPrice float64) float64 {
	risk := math.Abs(alert.EntryPrice - alert.StopLoss)
	if risk == 0 {
		return 0
	}

	if strings.EqualFold(alert.Side, "sell") {
		return (alert.EntryPrice - exitPrice) / risk
	}

	return (exitPrice - alert.EntryPrice) / risk
}

func timeframeMinutes(timeframe string) (int, bool) {
	switch timeframe {
	case "1m":
		return 1, true
	case "5m":
		return 5, true
	case "15m":
		return 15, true
	default:
		return 0, false
	}
}
