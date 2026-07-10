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

### Goal VP1 Status Update

The Flow Strip proof image (Telegram + engine-rendered SVG) is live in production.

The web history surface now mirrors that same trade-plan framing explicitly:

- Supabase `alert_history` gained nullable `trade_plan_*` columns (entry, stop,
  TP1, TP2, signal low/high, trigger, risk/reward)
- the engine now persists the full `TradePlan` alongside every alert record
- the web app's history list and history detail page both render explicit
  Entry / Stop / TP1 / TP2 tiles and a signal range line, using the same
  values the proof image and Telegram caption already show
- mock and engine-live fallback data carry trade plan data too, so the tiles
  render consistently across all three history data sources (Supabase, engine,
  mock)

This closes the last visible gap in VP1: Telegram and web history now present
the same setup, invalidation, and target framing.

The remaining VP1 should-include item — "replay confidence badge when
available" — is now also live; see the VP2 status update below, since the
badge is powered by the VP2 replay evidence.

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

### Goal VP2 Status Update

Replay confidence (signal count, follow-through rate, average move, sample
window, disclaimers) was already computed and shown on the Alerts page. That
evidence is now also surfaced on the history surface, where a trader actually
reviews delivered signals:

- `web/lib/alerts/replay.ts` gained `findReplayPreviewForRuleName()` to match
  a persisted history record back to its originating alert rule by name, and
  `getReplayBadgeLabel()` to render a compact one-line badge
- both the history list page and the history detail page now show a replay
  confidence badge (e.g. "Replay: 62% follow-through", "Replay: building
  sample", "Replay: selective (no recent trigger)", or "Replay unavailable")
  next to each proof card
- the history detail page also renders the fuller replay metrics tiles and
  disclaimer when a preview with signals exists, matching the framing already
  used on the Alerts page

This is still the narrow recent-replay confidence view, not a real historical
backtest — that honest limitation is unchanged. What's new is that the same
evidence trail is now visible everywhere a user reviews a signal (Alerts,
history list, history detail), not just on the Alerts page.

### Goal VP2.5 Status Update: Real Order-Book Ladder

We previously assumed the engine had no access to real order-book depth. That
assumption was wrong: Bybit's public v5 WebSocket exposes a free,
no-auth `orderbook.{depth}.{symbol}` topic (snapshot + delta), same tier as
the trade stream we already subscribe to. Since the visual proof was "not
impressive enough," we used this genuine data source instead of fabricating
one:

- `engine/internal/marketstate/state.go` now tracks a live bid/ask book per
  symbol (`ApplyOrderBookSnapshot`, `ApplyOrderBookDelta`, `OrderBookLevels`)
- `engine/internal/bybit/stream.go` subscribes to `orderbook.50.{symbol}`
  alongside `publicTrade.{symbol}` and keeps the book in sync via Bybit's
  snapshot-then-delta protocol (delta rows with size `0` remove a level)
- `engine/internal/proof/svg.go` renders a "Live Order Book" section: a
  DOM-style price ladder with the top 5 real resting bid/ask levels either
  side of the trigger price, bar length proportional to real size, and a
  book-imbalance percentage — falling back to "Order book not captured for
  this alert" if no snapshot has arrived yet (e.g. right after a reconnect)
- shipped in commit `b0c890d`, deployed to Railway, confirmed subscribed
  topics include `orderbook.50.BTCUSDT` / `orderbook.50.ETHUSDT` in production

This does **not** replace the point below about a full historical heatmap —
we only show a live snapshot at alert time, not a colored surface over time.
That remains future scope (see VP3/heatmap note), but it does mean the "we
don't have that data" statement in the section above is now outdated: we do
have real depth data, we just haven't built the time-series heatmap on top
of it yet.

## Later Goal

### Goal VP3: Deeper Historical Backtest

Only pursue this after VP1 and VP2 are solid.

Potential scope:

- longer-range historical replay
- exportable rule evidence
- richer strategy evaluation
- possible future fee/slippage-aware simulation

### Goal VP3 Status Update: Historical Data Pipeline (Done)

We previously assumed a real historical backtest engine was blocked on data
availability — "we do not currently have long-range historical
backtesting." That assumption was checked and turned out to be the same
class of mistake as VP2.5's order-book assumption: it was never actually
verified against what Bybit publishes.

**Bybit publishes free, no-auth, tick-by-tick historical trade archives** at
`https://public.bybit.com/trading/{symbol}/{symbol}{date}.csv.gz` — one
gzip CSV per day, with exact trade price/side/size/timestamp. Coverage
confirmed live: BTCUSDT back to 2020-03-25, ETHUSDT back to 2020-10-21 (5+
years for both symbols we currently trade). Neither `stacked_imbalance` nor
`trapped_traders` needs order-book depth to evaluate — both only consume
trade price/side/size aggregated into candles (`marketstate.Candle`) — so
this archive alone is sufficient to replay years of history through the
exact same rule logic that runs live.

What shipped:

- `engine/internal/historicaldata` — downloads and parses daily archives
  (`Client.FetchDailyArchiveBytes`, `ParseDailyArchive`) into
  `marketstate.Trade` values
- `historicaldata.Replayer` feeds historical trades through the *same*
  `marketstate.State.UpdateTrade` code path the live engine uses, via
  `ReplayDay`/`Flush` — a deliberate choice so backtest candle-bucketing can
  never silently drift from what live alerts actually see (no separate
  reimplementation to maintain or get out of sync)
- `engine/cmd/backfill` — a CLI (`go run ./cmd/backfill -symbol BTCUSDT
  -from 2024-01-01 -to 2024-01-31 -out ./data/BTCUSDT`) that downloads a
  date range, replays it, and writes real 1m/5m/15m candle history (OHLC +
  buy/sell volume) to CSV, with an optional `-cache-dir` so re-runs don't
  re-download already-fetched days
- validated end-to-end against live data: 2 real days of BTCUSDT (June
  2024, ~1.04M ticks) replayed correctly into exactly 2,880 1m candles and
  192 15m candles, with sane OHLC and buy/sell volume splits
- 7 new tests in `engine/internal/historicaldata`, all passing; full engine
  suite still green

This is the data foundation only — it does not yet run `evaluator.Evaluate`
against the cached candles, resolve outcomes against them, or add the
statistical-rigor layer (walk-forward validation, confidence intervals,
regime segmentation) a trustworthy backtest needs. Those are the next steps
before this can back a "backtested across 5 years" claim or a
before-you-go-live validation gate for custom rules.

### Goal VP3 Status Update: Backtest Runner (Done)

Built the piece the data pipeline above was foundation for: a runner that
replays historical trades through the *exact* production `evaluator.Evaluate`
code path (not a reimplementation) and resolves each resulting signal's real
outcome using the *exact* production `outcome.EvaluateCandle` stop/TP
hit-order logic real, live-delivered alerts are resolved with. A historical
win rate produced by this runner is therefore directly comparable to a live
one — same rule-matching code, same outcome-resolution code, same net-of-fees
cost model.

Two behavioral details this had to get right to genuinely match live, not
just approximate it:

- **Evaluate runs after every trade, not just on candle close.** The live
  stream (`bybit.PublicTradeStream.evaluateRulesForSymbol`) calls
  `evaluator.Evaluate` after every single trade update, since
  stacked-imbalance/trapped-traders signals can fire mid-candle as running
  volume ratios cross a threshold. `backtest.Runner.ReplayDay` does the
  same — call `Evaluate` once per trade, not once per closed candle.
- **Outcome resolution has to respect the same 48h resolution window** live
  alerting uses (`outcome.DefaultResolutionWindow`, now exported for this
  reuse) — without this cap, a backtest could credit a "win" to a signal
  that only resolved days later, which live alerting would already have
  marked `expired` well before then.

What shipped:

- `engine/internal/backtest.Runner` — replays trades through a dedicated
  `marketstate.State` + `evaluator.Evaluator`, recording every `Event` the
  rule fires, then resolves each one's real outcome against the replayed
  candle history via `outcome.EvaluateCandle`
- `engine/internal/backtest.Summarize` — aggregates signals into the same
  headline numbers the web Track Record card shows (win rate, gross/net avg
  R, cumulative R), using the same 0.15% realistic round-trip cost model as
  `web/lib/history/trading-costs.ts`
- `engine/internal/outcome.EvaluateCandle` and `.DefaultResolutionWindow`
  exported specifically for this reuse, so the exact same stop/TP
  hit-order rule and time cutoff apply to both live and historical
  resolution
- `engine/cmd/backtest` — a CLI (`go run ./cmd/backtest -symbol BTCUSDT
  -from 2024-01-01 -to 2024-01-31 -rule-type stacked_imbalance -timeframe 1m
  -confirmation-rows 3 -threshold-multiplier 300`) that downloads the date
  range, runs the backtest, and prints a summary (with a `< 30 resolved
  signals` sample-size warning), optionally writing every individual signal
  to a CSV via `-out`
- 5 new tests in `engine/internal/backtest` (TP1 win, stop loss, inactive
  rule, expired-with-no-further-history, and summary aggregation), all
  passing; full engine suite still green
- validated end-to-end against 7 real days of live BTCUSDT data (June 2024,
  ~7.49M ticks): 936 signals generated, 904 resolved (44.9% win rate,
  -0.10 gross avg R, -0.30 net avg R after costs) — numbers in the same
  realistic range as the live post-fix track record, not a suspiciously
  perfect backtest

Still missing before this can back a "backtested across 5 years" marketing
claim or a before-you-go-live validation gate for custom rules: the
statistical-rigor layer (walk-forward validation, confidence intervals on
win rate, regime segmentation across bull/bear/chop years, an explicit
look-ahead-bias test) and an actual multi-year backfill run to see whether
either rule type has a real edge over enough history to trust.

### Goal VP4: True Historical Heatmap / Footprint

Now unblocked on the data side (Bybit's `orderbook.{depth}.{symbol}` feed is
free and public — see VP2.5 above), but still a real lift: it requires
persisting book snapshots over time (not just at alert moments) and
rendering a colored liquidity surface, not a single-moment ladder.

## Goal VP5: Real Outcome Tracking (Done)

This directly answers "if I had taken this alert, would it have made money?"
without fabricating anything.

What it does:

- after an alert fires, the engine fetches real Bybit historical klines
  (`engine/internal/klines`) covering the time since the alert
- `engine/internal/outcome` walks those real candles chronologically and
  checks whether the trade plan's stop-loss, TP1, or TP2 was actually
  touched first
- if a single candle's high/low breaches both the stop and a take-profit
  level, the stop always wins — we never assume the better outcome when the
  true intra-candle order is unknowable
- unresolved alerts expire after 48h with an explanatory note rather than
  being silently dropped or counted as a win/loss
- results (`outcome_status`, `outcome_hit_price`, `outcome_r_multiple`, etc.)
  are persisted on `alert_history` via a background resolver job
  (`OUTCOME_RESOLVE_INTERVAL`, default 5m)
- the web history page now shows, per alert, a real outcome badge
  ("TP1 hit +1.5R", "Stopped out -1.0R", "Outcome: tracking", "No clear
  outcome") plus a "Track record" card aggregating win rate, average
  R-multiple, and a cumulative-R sparkline across all resolved alerts
- everything is computed from real Bybit price history — no simulated or
  estimated fills

This does not replace a full historical backtest engine (see VP3) — it only
tells you what really happened to alerts that were actually sent.

### Goal VP6: Walk-Forward Validation And The Alpha-Alerts Pivot (Done)

VP3's backtest runner made it possible to finally ask the real question
honestly: does either live rule (`stacked_imbalance`, `trapped_traders`)
have a robust edge, or does it only look good on whichever window you
happen to test?

What we built and ran:

- `engine/internal/backtest.ExitMode`/`TrendFilter`/`RunnerOption` -
  research-only extensibility (exit-mode variants, trend/quality filters)
  layered on top of the runner without changing production behavior
- `engine/internal/backtest.quality.go` - a 0-100 trade-quality composite
  score (displacement strength, volume confirmation, session weighting),
  implementing the "don't enter every imbalance, score the setup" idea
- `engine/cmd/backtest-sweep` - an exploratory single-window parameter
  sweep. **This tool proved capable of pure overfitting**: its "best"
  config on a 14-day window (+0.38 net avg R) collapsed to exactly a
  coin-flip (+0.00 gross R) on a separate out-of-sample month. Its output
  should never be trusted or published on its own.
- `engine/cmd/backtest-validate` - the tool that actually matters: a
  40-candidate grid (4 base rules x 2 exit modes x 5 quality thresholds),
  requiring net-positive average R on **both** a training window and a
  separate out-of-sample validation window before a config counts as
  passing.

Result on BTCUSDT (train: Jan 1-14 2024, validate: March 2024, ~85M real
trades replayed): **0 of 40 candidates passed.** Quality scoring and a
"ride to full TP2" exit mode did not rescue any variant. This is a
conclusive negative result for trade-tape-only signals at 1-15m on this
symbol/period - not proof no edge can ever exist, but proof this specific,
already-live rule set does not have one after realistic costs.

We also investigated whether real L2 order-book depth (not just the trade
tape) could unlock a genuine edge, since real footprint/absorption alpha
typically needs queue-level data:

- confirmed Bybit's free public archive has no historical L2/depth data
  (only trade tape, klines, index prices)
- Tardis.dev sells it (Bybit `incremental_book_L2` since 2020-05-28,
  ~$20-40/mo Solo tier, free 1-day-per-month CSV samples)
- built `engine/internal/l2book` to reconstruct a real order book and
  compute top-of-book imbalance from a Tardis CSV, verified against a free
  sample day (Bybit BTCUSDT, 2024-01-01: 22.9M raw book updates -> 84,175
  one-second imbalance snapshots)
- **found a genuine, statistically real signal** (correlation 0.05-0.26
  between imbalance and forward return depending on horizon, monotonic
  decile relationship) - unlike the trade-tape rules above, this is not
  noise
- but the effect size is tiny: 0.5-2 bps at 5s-300s horizons, smaller than
  Bybit's own round-trip taker fees (~11bps) and far below what this
  product's alert-holding-periods (minutes to hours, 30-200+bps targets)
  need. This is a real but HFT-scale signal, not tradeable standalone by a
  cloud-hosted alerting product regardless of budget - it would need
  co-located infrastructure and maker-rebate economics to capture directly.

### The Pivot Decision

Given both findings - no edge in the live trade-tape rules, and a real but
untradeable-at-this-product's-timescale L2 signal - the honest choice is to
stop presenting this product as an "alpha alerts" / guaranteed-edge service.

**Sentinel Flow is repositioned as an order-flow context and awareness
tool**, not a profitability guarantee:

- alerts and proof visuals show *what is happening* in the order flow
  (imbalance, absorption, trapped positions) clearly and fast - that part
  of the product is real and already works well
- the product does not claim, and the `/backtest` page and billing copy
  should not imply, that following these alerts is proven to be
  profitable - our own walk-forward validation says otherwise for the
  current rule set
- monetization stays viable on this honest framing: traders already pay
  for order-flow context/visualization tools (e.g. Bookmap-style products)
  without expecting a packaged, guaranteed edge
- `L2ImbalanceFilter` (in `engine/internal/backtest/l2filter.go`) and the
  L2 book-reconstruction groundwork are kept as-is for future research
  (e.g. as a confirming layer on top of a rule, if one is ever found to
  have a real edge), but no further external data spend is planned for now
  - see the `goal4-orderbook-data` and `goal6-pivot-decision` todos

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
