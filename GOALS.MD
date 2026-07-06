# Sentinel Flow Goals

This is the single source-of-truth execution file for Sentinel Flow. Every goal below is written to keep the product production-ready, value-driven, simple to build, simple to operate, and credible to monetize.

## Prime Objective

Build Sentinel Flow as a production-ready, minimal-complexity, highly reliable, mobile-first order-flow alert product that gives traders clear value fast, stays simple to operate, and is strong enough to monetize confidently.

## Product Standard

Every goal must support these non-negotiables:

- Production-ready by design, not prototype-first
- Simple implementation with minimal moving parts
- High trader value and clear reliability
- Strong monetization potential
- Clean, accurate, mobile-first UI
- Functional validation before goal completion
- No unnecessary technical complexity

## Status Guide

- `Completed`: goal scope is done and validated for its intended slice
- `In Progress`: most of the slice is built, but live validation or a final production gap remains
- `Pending`: defined and sequenced, but not yet executed

## Goal 1: Repo Audit and Production Scaffold

### What This Achieves

Creates the stable foundation for the product so every later feature can be added without structural churn or rework.

### Achieved

- Repository structure established for `web/`, `engine/`, `scripts/`, and docs
- Core documentation and ignore rules added
- Next.js web app scaffolded
- Go engine scaffold activated
- Initial scaffold validation completed

### To Achieve

- Nothing material remains for this goal

### Validation

- Repository structure is understandable and stable
- Web scaffold boots, builds, and supports the app shell

### Status

`Completed`

## Goal 2: Web App Shell and UI Foundation

### What This Achieves

Delivers the production-safe app shell, protected routes, and UI primitives so the product already feels like a real platform instead of a prototype.

### Achieved

- Next.js application shell built
- `shadcn/ui` foundation added for production-safe UI primitives
- Core routes added: `/`, `/sign-in`, `/dashboard`, `/alerts`, `/history`, `/settings`, `/billing`
- Supabase SSR auth wiring added
- Sign-in, callback, and sign-out flow scaffolded
- Protected app layout behavior added
- Shared navigation and shell components added
- Build-safe behavior added for missing Supabase environment values
- External Google font dependency removed to reduce fragility
- Web runtime contract now explicitly requires Node `22+`, reducing drift against current Supabase support expectations
- Web test and production build validation now pass under a Node `22+`-compatible runtime without the prior Supabase deprecation warning

### To Achieve

- Validate auth against a real Supabase project
- Upgrade runtime to Node `22+` to align with future Supabase support
- Run deeper route-level UI verification on the live shell

### Validation

- `pnpm lint` passes
- `pnpm test` passes
- `pnpm build` passes
- Auth redirects and protected routes work with a real Supabase project

### Status

`In Progress`

## Goal 3: Telegram Connection Flow

### What This Achieves

Creates the first real alert delivery path so users can pair Telegram once and trust alerts can reach them where they actually act.

### Achieved

- Telegram environment contract added to `.env.example`
- Signed Telegram deep-link token generation added
- Telegram config and bot helpers added
- Telegram connection persistence layer added
- Supabase admin client support added for Telegram persistence
- Telegram webhook route added at `/api/telegram/webhook`
- Optional Telegram webhook secret verification added for production hardening
- Settings page connect and disconnect controls added
- `telegram_connections` migration added
- Setup and validation doc added at `web/docs/goal-3-telegram.md`
- Duplicate Telegram chat-link conflicts now return user-facing guidance instead of failing opaquely
- Route-level webhook tests now cover authorization, token handling, persistence gating, conflict handling, and successful pairing
- Goal 3 now has a reusable live-validation harness for Telegram bot health, webhook alignment, and Supabase connection persistence checks
- A Windows-friendly Goal 3 runner now stamps JSON and markdown validation evidence, including stable latest-copy artifacts
- Goal 3 validation failure artifacts have been smoke-checked so misconfigured runs still produce actionable setup evidence
- Goal 3 now includes a repeatable Telegram webhook configuration helper to reduce manual setup errors before live pairing validation
- The webhook configuration helper has been smoke-checked to fail safely with clear missing-environment guidance
- Settings now expose a pairing readiness panel so auth, bot, persistence, and webhook setup gaps are visible before a user attempts Telegram pairing
- Pairing readiness logic now lives in a dedicated helper with focused tests, strengthening the Goal 3 UI validation gate
- Telegram reconnects now preserve the original `connected_at` timestamp while refreshing `last_seen_at`, improving connection-history reliability
- Goal 3 connection persistence now has focused tests for first connect, reconnect preservation, and Supabase conflict detection
- Settings now surface deterministic `Connected` and `Last seen` timestamps for Telegram pairings, making connection trust signals visible to the user
- Goal 3 presentation helpers now have focused tests for UTC timestamp formatting and connection fact mapping
- Telegram connect links are now generated on demand through `/api/telegram/connect`, avoiding stale page-render pairing tokens
- Web test discovery now includes both `app/**/*.test.ts` and `lib/**/*.test.ts`, so Telegram route tests participate in the real validation gate
- Telegram pairing auth handoff now preserves a safe return path to Settings, so unauthenticated users come back to the pairing surface after sign-in
- Safe internal `next`-path normalization now has focused tests and participates in the real web validation gate
- Goal 3 now has direct tests for auth callback redirects and magic-link callback URL construction, strengthening the sign-in handoff proof

### To Achieve

- Validate the full flow with a real Telegram bot
- Validate persistence with a real Supabase project
- Confirm webhook delivery and `/start` handling end to end
- Add final production webhook setup notes

### Validation

- User can connect Telegram from the app
- Webhook receives and processes a live Telegram event
- Connection state persists across refresh and re-login

### Status

`In Progress`

## Goal 4: Alert Rule Configuration

### What This Achieves

Lets users configure high-value alerts through a simple product surface without exposing rule-engine complexity.

### Achieved

- Shared alert rule schema and types added
- Server-side alert rule CRUD layer added
- Alert rule server actions added
- Guided alert rule form added
- Alert rule list added
- Dashboard visibility for saved rules added
- `alert_rules` migration added
- Launch-range validation added for alert names and rule parameters
- Launch scope intentionally constrained to `BTCUSDT`, `ETHUSDT`, `1m`, `5m`, `15m`, `stacked_imbalance`, `trapped_traders`, and `telegram`
- Goal 4 now has direct server-action tests for validation failure, create, update, persistence-error handling, and delete revalidation
- Alert-rule deletes now surface Supabase delete failures instead of failing silently
- Goal 4 now has direct persistence-layer tests for current-user list/read/create/update/delete behavior and unauthenticated/config-missing save protection
- Goal 4 now has a reusable live-validation harness for Supabase alert-rule reads and optional owner-scoped CRUD proof
- A Windows-friendly Goal 4 runner now stamps JSON and markdown validation evidence, including stable latest-copy artifacts
- Goal 4 validation failure artifacts have been smoke-checked so misconfigured runs still produce actionable setup evidence
- The alerts page now surfaces a clear recovery state when an edit target is missing or unavailable, reducing edit-flow confusion

### To Achieve

- Validate create, edit, and delete against a real Supabase project
- Verify persistence, edit safety, and rule presentation in the UI

### Validation

- Rules save and reload correctly
- Rules edit without schema drift or UI confusion
- Dashboard and alerts pages reflect live saved data correctly

### Status

`In Progress`

## Goal 5: Market Engine Ingestion Pipeline

### What This Achieves

Builds the minimal reliable live market engine that can ingest, normalize, and maintain the market state every later signal depends on.

### Achieved

- Go engine module scaffolded and activated
- Engine entrypoint added
- Environment-driven config added
- Minimal HTTP service added
- Health routes added: `/`, `/healthz`, `/readyz`
- Bybit public trade websocket client added
- Topic subscription support added for launch symbols
- Ping and reconnect behavior added
- Trade payload normalization added
- Per-symbol stream state added
- Candle aggregation added for `1m`, `5m`, and `15m`
- Rolling in-memory candle history added for evaluator reads
- Engine health responses expose stream and candle state
- Engine test and build baseline established
- Engine readiness now requires recent market messages instead of staying green indefinitely after the first message, improving stale-stream detection
- Engine health responses now expose a direct stream freshness signal, making stale-data diagnosis clearer for operators
- Engine `/readyz` now reports a concrete warm-up reason such as disconnected, stale, waiting for market data, or waiting for rule sync
- Engine readiness reasoning now lives in one engine-level path with focused branch coverage, reducing drift between runtime state and HTTP readiness reporting
- Engine websocket shutdown now unwinds cleanly on context cancel and records a proper disconnected state, improving production lifecycle reliability
- Goal 5 now has a reusable live-validation harness, Windows runner, and evidence artifact flow for engine health, readiness, and launch coverage signoff
- Goal 5 validation failure artifacts have been smoke-checked so missing-engine runs still produce actionable evidence instead of opaque failure
- Engine reconnect backoff now resets after a real successful session, improving recovery speed after intermittent disconnects without widening complexity

### To Achieve

- Validate live websocket flow end to end against Bybit
- Tighten in-memory market-state lifecycle behavior
- Add more tests around live handling and reconnect behavior

### Validation

- `go test ./...` passes
- `go build ./...` passes
- Engine connects, streams, and recovers correctly in live conditions

### Status

`In Progress`

## Goal 6: First Rule Evaluation Slice

### What This Achieves

Turns raw market data into the first monetizable product behavior: trustworthy alert decisions that can later be sold with confidence.

### Achieved

- Product rule scope defined
- Alert rule persistence exists on the web side
- Engine market state exposes current and recent candles for evaluator reads
- First `stacked_imbalance` evaluator package added in the engine
- One-bucket duplicate suppression added for repeated evaluator emissions
- Deterministic evaluator tests added for trigger, rejection, and suppression behavior
- Engine runtime evaluates a small in-memory launch rule set and exposes recent evaluated events through status responses
- Supabase-backed rule loading path added for persisted `alert_rules`
- Rule evaluation reads from concurrency-safe rule snapshots during live sync updates
- Engine runtime tracks rule source, last sync time, and sync errors in status responses
- Engine readiness reflects persisted-rule sync health when Supabase-backed rules are configured
- Goal 6 now has a reusable live-validation harness, Windows runner, and evidence artifact flow for Supabase-backed rule sync proof
- Goal 6 validation failure artifacts have been smoke-checked so missing-engine or missing-Supabase runs still produce actionable sync evidence

### To Achieve

- Live-validate persisted rule syncing against a real Supabase project
- Replace the fallback launch rule set once real rule syncing is verified

### Validation

- Same input always produces the same evaluation result
- Duplicate alerts are suppressed correctly
- Saved rules can participate in the real evaluation flow

### Status

`In Progress`

## Goal 7: Proof Snapshot Rendering

### What This Achieves

Adds visual proof to every alert so traders can trust the signal faster, which directly supports retention, perceived quality, and willingness to pay.

### Achieved

- Proof snapshot requirement defined in product planning
- Initial SVG proof generator added in the engine for evaluated alerts
- Deterministic proof tests added for core content and text escaping
- Engine runtime attaches proof SVG payloads to recent evaluated events
- Proof payloads use a stable artifact contract with dimensions, media type, and content hash
- Pure-Go SVG-to-PNG rendering path added in the engine proof package
- Web history route uses a typed proof display contract with snapshot preview cards
- Engine runtime exposes recent alert records, not only raw evaluated events
- Web history types align to the engine-side alert record contract naming and shape
- Web history can optionally consume live engine `recentAlerts` and fall back safely to mock data
- Web history includes a per-alert proof detail route backed by the shared history source
- Proof metadata now persists into real alert history records for later review
- Proof history views now render proof artifacts through safe image sources instead of raw HTML injection, reducing XSS-style exposure in the review surface
- Nested proof-detail routes now preserve the correct section title in the mobile app shell, improving route clarity during review flows
- Goal 7 now has a reusable live-validation harness, Windows runner, and evidence artifact flow for proof artifact contract signoff
- Goal 7 validation failure artifacts have been smoke-checked so missing-engine runs still produce actionable proof-contract evidence

### To Achieve

- Finalize the delivery rendering contract around the shared proof artifact shape

### Validation

- Triggered alerts generate a consistent proof image
- Proof output is readable on mobile
- Proof metadata links correctly to alert history records

### Status

`In Progress`

## Goal 8: Telegram Alert Dispatch and History Loop

### What This Achieves

Closes the loop from signal to delivery to reviewable history, which is one of the strongest trust, retention, and monetization drivers in the product.

### Achieved

- Engine-side alert record contract exists for downstream dispatch and persistence
- Engine-side Telegram delivery client supports proof-aware `sendPhoto` formatting
- Persisted rules carry user ownership through the engine
- Telegram chat targets can be resolved from Supabase connections
- Engine runtime attempts live Telegram delivery for dispatchable alert records
- Engine delivery path rasterizes proof SVGs into PNG attachments before Telegram send
- Recent alert records update delivery state across `evaluated`, `queued`, `delivered`, and `retrying`
- Focused engine tests validate successful delivery, missing-target behavior, and failure-state transitions
- `alert_history` persistence schema exists with user-owned proof metadata and delivery state
- Engine upserts triggered alerts into persisted history before and during delivery-state transitions
- Web history pages prefer persisted per-user alert history and show a real empty state when no alerts exist
- Web history detail resolves a persisted alert record by id through the signed-in user context
- Engine performs bounded Telegram retry attempts with backoff before giving up on retryable delivery failures
- Retry attempts continue to persist user-visible delivery-state transitions so failure handling remains observable
- Goal 8 has an executable live-validation harness and runbook for engine, Telegram, Supabase, and persisted alert history checks
- Engine health responses expose delivery observability counters and last-status fields for live Goal 8 verification
- Engine exposes a validation-key-guarded alert trigger endpoint so Goal 8 can be exercised on demand in a real environment
- Goal 8 live validation can run as a one-command flow that optionally triggers a real alert before collecting evidence
- The Goal 8 harness can poll until the triggered alert is visible in engine status and persisted history
- The dashboard surfaces engine delivery health, retry counts, and persisted-write visibility when `ENGINE_STATUS_URL` is configured
- Triggered Goal 8 validation runs fail hard if the alert lifecycle is not observed in both engine status and persisted history
- The history review surface also shows engine delivery visibility, reinforcing trust where users inspect alerts
- Goal 8 validation writes reusable signoff evidence after a live run
- A Windows-friendly local runner stamps and saves Goal 8 validation evidence automatically
- Goal 8 emits structured failure evidence for misconfigured runs
- Goal 8 evidence generation includes both JSON and markdown artifacts
- Goal 8 evidence artifacts include sanitized run configuration and next-step guidance
- Goal 8 failure artifacts have been smoke-checked with self-contained setup guidance
- Goal 8 validation now also refreshes stable `*-latest.json` and `*-latest.md` evidence files for the newest run

### To Achieve

- Run live end-to-end validation of persisted history with real Supabase infrastructure

### Validation

- Triggered alert is delivered to Telegram reliably
- Failed delivery paths are observable and retry safely
- History reflects actual sent alerts with proof context

### Status

`In Progress`

## Goal 9: Billing and Subscription Gating

### What This Achieves

Converts delivered trader value into recurring revenue with clear plan control, simple access gating, and low-friction upgrades.

### Achieved

- Billing route now exposes launch pricing cards, current account state, and clear launch guardrails
- Pricing direction is defined in the PRD
- Monetization ladder is conceptually clear: Scout, Founding Access, Sentinel Pro, Alpha Stream
- Stripe Billing configuration now supports launch checkout plans, optional launch trials, and customer-portal management
- Server actions now redirect authenticated users into Stripe Checkout and back into the Stripe customer portal
- Stripe webhook intake now verifies signatures and syncs subscription state into Supabase-backed billing snapshots
- `billing_accounts` persistence now tracks Stripe customer mapping, plan state, renewal timing, and cancellation-at-period-end
- Alert activation is now gated by paid subscription state, so inactive accounts cannot turn live rules on
- Scout-tier access now enforces a hard two-active-rule limit while higher tiers remain uncapped
- Alerts and billing surfaces now explain the live rule gate in the rendered UI, reducing monetization confusion at launch
- Goal 9 validation now includes focused webhook tests, entitlement tests, active-rule gating tests, and a live browser UI smoke pass

### To Achieve

- Validate upgrade, downgrade, renewal, and failed-payment paths
- Run live Stripe checkout, webhook, and portal validation against a real account
- Decide whether Alpha Stream stays sales-led or becomes self-serve in the first public release

### Validation

- User can start a paid plan successfully
- Subscription state gates product access correctly
- Billing state survives refreshes, re-login, and webhook updates

### Status

`In Progress`

## Goal 10: Production Readiness and Founding Access Launch

### What This Achieves

Confirms the MVP is genuinely safe for real users, credible to market publicly, and strong enough to start monetizing without overpromising.

### Achieved

- Validation strategy is defined
- Launch and monetization framework is defined
- Multiple product slices have already been checked with lint, tests, and builds
- The dashboard now includes a shared launch-readiness checklist that combines auth, Telegram, billing, rules, and engine signals into one operator-facing Goal 10 proof surface
- Launch readiness logic now lives in a focused helper with direct tests for complete and incomplete public-release states
- Goal 10 UI validation now includes real browser checks of the dashboard readiness surface on desktop and mobile viewports without console errors
- Goal 10 now has a unified launch-audit harness that can run web tests, production build checks, route smoke checks, and delegated Goal 5 to Goal 8 validations from one command
- A Windows-friendly Goal 10 runner now stamps JSON and markdown launch-audit artifacts, including stable latest-copy evidence files
- Goal 10 artifact generation has been smoke-checked locally with successful route, test, and build evidence output against the running web app

### To Achieve

- Run end-to-end validation with real services
- Run UI validation across core routes and mobile breakpoints
- Run Telegram live validation
- Run alert-rule live validation
- Run engine live validation
- Add observability checks for production operations
- Complete launch checklist
- Prepare Founding Access release state

### Validation

- Core flows work end to end with real infrastructure
- UI is clean, accurate, and mobile-safe
- Reliability is strong enough for initial public users
- Pricing, gating, and onboarding are ready for a Founding Access release

### Status

`In Progress`

## Current State Summary

### Already Achieved

- Product direction is defined
- Architecture direction is defined
- UI direction is defined
- Validation approach is defined
- Monetization direction is defined
- Web shell is working
- Auth scaffold is working
- Telegram scaffold is working
- Alert rule scaffold is working
- Engine ingestion baseline is working
- Evaluator baseline is working
- Proof rendering baseline is working
- Alert delivery and persisted history loop are largely built

### Still To Achieve

- Real-service validation for Supabase and Telegram
- Live rule evaluation validation
- Full proof-to-delivery production signoff
- Billing and subscription gating
- Full production launch validation

## Recommended Execution Order

1. Finish Goal 3 live Telegram validation
2. Finish Goal 4 live alert-rule validation
3. Finish Goal 5 live engine validation
4. Finish Goal 6 live persisted-rule validation
5. Finish Goal 7 proof delivery contract signoff
6. Finish Goal 8 live persisted-history validation
7. Build Goal 9 billing and subscription gating
8. Complete Goal 10 production readiness and Founding Access launch validation
