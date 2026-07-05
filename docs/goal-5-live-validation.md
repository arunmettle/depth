# Goal 5: Live Engine Validation

This runbook gives Goal 5 a repeatable live signoff path for the market ingestion engine.

## Required environment

```bash
ENGINE_STATUS_URL=http://127.0.0.1:8080/healthz
VALIDATION_REPORT_PATH=artifacts/goal-5-validation-20260706-000000.json
```

## Optional environment

```bash
VALIDATION_EXPECT_READY=true
VALIDATION_EXPECT_RULE_SOURCE=static-launch-rules
VALIDATION_EXPECT_SYMBOLS=BTCUSDT,ETHUSDT
VALIDATION_EXPECT_TIMEFRAMES=1m,5m,15m
VALIDATION_POLL_INTERVAL_MS=1000
VALIDATION_POLL_TIMEOUT_MS=30000
```

Set `VALIDATION_EXPECT_RULE_SOURCE=supabase-alert-rules` when the engine is running with persisted rule sync enabled and you want that source proven during the run.

## What the harness checks

- `ENGINE_STATUS_URL` responds with a valid Goal 5 health payload
- matching `/readyz` becomes green when `VALIDATION_EXPECT_READY=true`
- stream state is connected and fresh
- market messages and normalized trades are flowing
- launch topics for `BTCUSDT` and `ETHUSDT` are subscribed
- symbol state exists for the expected launch symbols
- current candle coverage exists for `1m`, `5m`, and `15m`
- optional rule-source alignment is proven when `VALIDATION_EXPECT_RULE_SOURCE` is set

## Commands

```bash
node scripts/validate-goal-5.mjs
```

Windows helper:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-goal-5-validation.ps1
```

## Artifacts

- JSON report at `VALIDATION_REPORT_PATH`
- markdown summary beside the JSON artifact
- stable `goal-5-validation-latest.json`
- stable `goal-5-validation-latest.md`

## Notes

- The harness is intentionally engine-only. It proves ingestion readiness and launch symbol coverage without requiring Telegram or Supabase delivery infrastructure.
- Misconfigured runs still write evidence artifacts when `VALIDATION_REPORT_PATH` is set, which keeps failed signoff attempts actionable instead of opaque.
