# Engine

This folder contains the Sentinel Flow market engine.

## Planned responsibility

- Connect to Bybit public market data
- Maintain in-memory rolling state
- Evaluate supported order-flow rules
- Generate proof snapshot payloads
- Persist triggered alerts
- Dispatch Telegram alerts

## Planned stack

- Go
- One deployable service
- Minimal external dependencies

## Current status

The engine now has a real Go module and a minimal runnable HTTP service.
Goal 5 now also has a repeatable live validation harness for engine health, readiness, stream freshness, and launch symbol/timeframe coverage.

## Local setup

1. Load the variables from `.env.example` into your environment
2. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` to load persisted alert rules through the Supabase Data API
3. Apply the matching Supabase migrations from `web/supabase/migrations` so `alert_rules`, `telegram_connections`, and `alert_history` exist
4. Set `TELEGRAM_BOT_TOKEN` if you want the engine-side delivery client available
5. Set `VALIDATION_API_KEY` if you want to enable the guarded live-validation trigger endpoint
6. Start the engine with your preferred environment loader

If Supabase rule credentials are not configured, the engine falls back to the in-memory launch rule set.

When Supabase rule loading is configured, `/readyz` now stays unready until the engine has both live market data and a successful rule sync.

### Included

- `cmd/server`: entrypoint
- `internal/config`: environment-driven config
- `internal/app`: HTTP routes and health endpoints
- `internal/marketstate`: current candle state plus short rolling history for evaluator-ready reads
- `internal/evaluator`: first launch-scope stacked-imbalance evaluator with duplicate suppression
- engine status now exposes recent evaluated events and configured in-memory launch rules
- `internal/rulesource`: static and Supabase-backed rule loading for engine evaluation
- `internal/proof`: deterministic SVG proof snapshot generation for evaluated alerts
- `internal/alerts`: stable alert record contract for history, delivery, and persistence
- `internal/telegram`: proof-aware Telegram formatter and `sendPhoto` client
- `internal/alertstore`: Supabase-backed alert history persistence for proof review and delivery status
- persisted rules now carry user ownership, and Telegram connections can be resolved by user through Supabase
- recent evaluated events now carry proof SVG payloads through engine status responses
- proof payloads now include stable artifact metadata such as media type, dimensions, and content hash
- proof package now supports pure-Go SVG-to-PNG rendering for delivery surfaces
- triggered alerts can now be persisted to `alert_history` before and during delivery-state transitions
- retryable Telegram delivery failures now use a bounded in-process backoff loop before the engine stops retrying
- a guarded validation trigger endpoint can run the real alert lifecycle without waiting for a live market pattern

### Current routes

- `/`
- `/healthz`
- `/readyz`
- `/internal/validate/alert` when `VALIDATION_API_KEY` is configured

### Next engine steps

- run live Goal 5 signoff against a real engine deployment with `node ../scripts/validate-goal-5.mjs`
- live-validate Supabase-backed saved rule syncing
- live-validate persisted alert history and Telegram delivery together
