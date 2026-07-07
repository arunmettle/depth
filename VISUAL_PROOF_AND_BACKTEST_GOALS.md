# Visual Proof And Backtest Goals

This file tracks the focused product work around alert visuals, trader comprehension, and evidence of alert quality.

It exists so we can keep one simple reference for:

- what is already implemented
- what is missing
- what we are choosing to build next
- how this connects to product value and monetization

## Current Product Truth

The product now has a working live path:

- web app deployed on Vercel
- Go engine deployed on Railway
- live Bybit trade stream connected
- Supabase-backed rule loading working
- Telegram delivery working
- proof-backed alert history persistence working

The product can already:

- ingest live BTCUSDT and ETHUSDT trades
- build 1m, 5m, and 15m candles from raw trades
- evaluate `stacked_imbalance` rules
- persist alerts to Supabase
- send Telegram alerts
- surface live engine health in the web app

## What We Have Already Done

### Engine logic

- implemented live `stacked_imbalance` evaluation
- implemented duplicate suppression so the same bucket is not sent repeatedly
- implemented a simple trade plan for live rule alerts:
  - entry
  - stop loss
  - TP1
  - TP2

### Telegram and proof

- upgraded Telegram caption format from a plain alert message into a setup-oriented message
- upgraded proof card to focus more on setup context instead of generic status
- deployed the engine so the new alert path is now live

### Replay / confidence

- added a `stacked_imbalance` recent replay preview in the web app
- replay preview currently shows:
  - sample window
  - signal count
  - follow-through rate
  - short-horizon average move

## What Is Still Missing

### 1. Strong trader-grade visual proof

Current proof is better than before, but still not strong enough for very fast trader comprehension.

What is missing:

- a compact visual signal explanation
- a faster “why this fired” representation
- a cleaner signal-window view
- stronger visual separation of:
  - setup
  - invalidation
  - targets
  - replay confidence

### 2. Heatmap / footprint-style charting

We do **not** currently have the data needed for a real:

- order-book heatmap
- footprint-by-price ladder
- liquidity heat signature chart

Current engine data is:

- trade price
- trade side
- trade size
- timestamp

That means we can truthfully build:

- imbalance bars
- confirmation window visuals
- buy vs sell dominance visuals
- signal-window mini charts

But we cannot truthfully build:

- real liquidity heatmaps
- true order-book absorption maps
- footprint cells by price level

### 3. Full historical backtest system

We do **not** yet have:

- long-range historical backtesting
- fee/slippage-aware PnL simulation
- multi-week or multi-month rule evidence
- full alert-by-alert backtest showcase
- backtest support for `trapped_traders`

What exists today is a narrow recent replay confidence layer, not a full backtest engine.

## Product Direction For This Track

We should not fake advanced visuals or overclaim backtest confidence.

The right product move is:

1. build the strongest truthful visual proof using the data we already have
2. make every alert understandable in seconds
3. expose replay evidence clearly but honestly
4. only add advanced charting or richer backtests when the data foundation supports it

## Next Build Goal

### Goal VP1: Signal Visual v1

Build a trader-grade visual proof surface for each live alert and history record using current engine data only.

This should include:

- a compact signal-window visual
- 3-candle confirmation display
- buy vs sell imbalance bars
- clear trigger direction
- entry / stop / TP1 / TP2 display
- signal range display
- replay confidence badge when available

Success criteria:

- a trader can understand the alert in a few seconds
- the image explains *why* the signal fired
- the image is cleaner and more useful than the current proof card
- the same proof style can support Telegram and web history

## Follow-up Goal

### Goal VP2: Backtest Showcase v1

Build a rule-level evidence surface that shows recent replay confidence clearly for each saved alert rule.

This should include:

- signal count
- follow-through rate
- average short-horizon move
- sample window size
- honest caveats

Success criteria:

- users can inspect whether a rule is selective or noisy
- users can judge whether the alert has enough recent evidence to be trusted
- the product communicates confidence without pretending to guarantee profitability

## Later Goal

### Goal VP3: Deeper Historical Backtest

Only pursue this after VP1 and VP2 are solid.

Potential scope:

- longer-range historical replay
- exportable rule evidence
- richer strategy evaluation
- possible future fee/slippage-aware simulation

## Decision Notes

- No fake heatmap visuals
- No fake footprint visuals
- No fake profitability claims
- Visual speed matters
- Simplicity matters
- Reliability matters more than visual novelty

## Current Prime Target

Deliver a product where:

- traders understand alerts quickly
- alerts feel reliable and evidence-backed
- Telegram messages are actionable
- proof visuals increase trust instead of adding noise
- confidence surfaces support monetization without overclaiming
