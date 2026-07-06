# Goal 8 Live Validation

This document defines the exact live-service evidence we need before Goal 8 can be considered truly production-validated.

## What this validation proves

- The engine is running and exposing current evaluator status
- The engine is exposing delivery and persistence observability for live verification
- Telegram bot credentials are valid
- Telegram webhook configuration is consistent with the web app
- Supabase is reachable through the Data API
- `alert_history` is receiving real persisted alert rows with proof metadata
- Delivery-state transitions remain observable across retries and successful sends

## Required environment

Set these variables before running the validation script:

```bash
ENGINE_STATUS_URL=http://127.0.0.1:8080/healthz
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BASE_URL=https://api.telegram.org
NEXT_PUBLIC_SITE_URL=http://localhost:3000
TELEGRAM_WEBHOOK_SECRET=...
VALIDATION_USER_ID=...
VALIDATION_API_KEY=...
VALIDATION_TRIGGER_ALERT=true
VALIDATION_TRIGGER_MARKET=BTCUSDT
VALIDATION_TRIGGER_SIDE=buy
VALIDATION_TRIGGER_TIMEFRAME=1m
VALIDATION_POLL_INTERVAL_MS=1000
VALIDATION_POLL_TIMEOUT_MS=20000
VALIDATION_REPORT_PATH=artifacts/goal-8-validation.json
```

Notes:

- `VALIDATION_USER_ID` is optional but recommended. If set, Supabase checks are scoped to a single user.
- `NEXT_PUBLIC_SITE_URL` is optional for the script, but it allows webhook URL comparison against the expected `/api/telegram/webhook` endpoint.
- `VALIDATION_API_KEY` enables the engine validation trigger endpoint at `POST /internal/validate/alert`.
- Set `VALIDATION_TRIGGER_ALERT=true` if you want the harness to call the validation trigger automatically before checking engine, Telegram, and Supabase state.
- `VALIDATION_POLL_INTERVAL_MS` and `VALIDATION_POLL_TIMEOUT_MS` control how long the harness waits for the triggered alert to appear in engine status and persisted history.
- `VALIDATION_REPORT_PATH` lets the harness write a reusable JSON evidence artifact after the run completes.
- If `VALIDATION_REPORT_PATH` is set, the harness can now write a structured report even for failed or misconfigured runs.
- When `VALIDATION_REPORT_PATH` is set, the harness also writes a sibling markdown summary for fast human review.
- The saved artifacts now include sanitized run configuration and recommended next steps, so the evidence stands on its own.
- The harness also refreshes stable `*-latest.json` and `*-latest.md` copies in the same directory for easy access to the newest run.
- For a shared starting point across all live signoff flows, use [validation.env.example](/C:/Dev/Depth/docs/validation.env.example).

## Run the validation harness

From the repository root:

```bash
node scripts/validate-goal-8.mjs
```

On Windows, you can also use the helper runner:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-goal-8-validation.ps1 -TriggerAlert
```

The helper will:

- stamp a timestamped JSON report path under `artifacts/`
- write a sibling markdown summary next to that JSON artifact
- refresh stable latest JSON and markdown copies in the same directory
- set `VALIDATION_TRIGGER_ALERT=true` when `-TriggerAlert` is passed
- reuse the existing Node validation harness

With `VALIDATION_TRIGGER_ALERT=true`, the script will:

1. Call the guarded engine validation endpoint
2. Generate a real alert lifecycle for the chosen user
3. Poll until the triggered alert appears in engine status and persisted history, or until timeout
4. Check engine health and delivery observability
5. Check Telegram bot and webhook state
6. Check Supabase persisted history
7. Optionally write the full validation summary to `VALIDATION_REPORT_PATH`

When `VALIDATION_TRIGGER_ALERT=true`, the run should be treated as failed if the triggered alert does not appear in both:

- engine `recentAlerts`
- Supabase `alert_history`

The script checks:

- `ENGINE_STATUS_URL`
- `readyz` status derived from the engine health URL
- engine delivery observability fields such as attempts, retries, persisted writes, and last delivery status
- Telegram `getMe`
- Telegram `getWebhookInfo`
- Supabase `alert_rules`
- Supabase `telegram_connections`
- Supabase `alert_history`

## Expected live validation flow

1. Apply all Supabase migrations under `web/supabase/migrations`
2. Start the web app
3. Start the engine with real Supabase and Telegram credentials
4. Connect Telegram from the Settings page
5. Confirm at least one active alert rule exists for the validation user
6. Run `node scripts/validate-goal-8.mjs`
7. Confirm the Telegram alert arrives
8. Open the web history view and confirm the same alert is visible there
9. Keep the script output plus the generated JSON/markdown files and their stable latest copies as Goal 8 validation evidence

## Evidence required for Goal 8 signoff

- Engine `/healthz` returns `200`
- Engine `/readyz` returns `200`
- Engine health payload includes delivery observability fields:
  - `dispatchAttempts`
  - `retryAttempts`
  - `persistedWrites`
  - `lastDeliveryStatus`
- If the harness triggers an alert, the run fails unless that alert is observed in both:
  - engine `recentAlerts`
  - Supabase `alert_history`
- Telegram `getMe` succeeds for the configured bot
- Telegram webhook is configured to the expected web endpoint
- At least one `alert_history` row exists for the validation user
- The latest `alert_history` row includes:
  - `delivery_status`
  - `proof_content_hash`
  - `proof_media_type`
- The history UI displays the persisted record

## Acceptable warning cases during early validation

- No `alert_history` rows yet because no rule has triggered
- Engine `readyz` still warming while market data or rule sync is initializing
- Telegram webhook URL mismatch during local testing

These warnings mean Goal 8 is not fully signoff-ready yet, but they are useful while the environment is still being prepared.
