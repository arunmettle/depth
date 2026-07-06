# Goal 6: Live Persisted-Rule Validation

This runbook gives Goal 6 a repeatable signoff path for Supabase-backed rule syncing into the engine.

## Required environment

```bash
ENGINE_STATUS_URL=http://127.0.0.1:8080/healthz
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=...
VALIDATION_REPORT_PATH=artifacts/goal-6-validation-20260706-000000.json
```

## Optional environment

```bash
VALIDATION_USER_ID=...
VALIDATION_EXPECT_READY=true
VALIDATION_EXPECT_RULE_SOURCE=supabase-alert-rules
VALIDATION_EXPECT_SYMBOLS=BTCUSDT,ETHUSDT
VALIDATION_EXPECT_TIMEFRAMES=1m,5m,15m
VALIDATION_POLL_INTERVAL_MS=1000
VALIDATION_POLL_TIMEOUT_MS=30000
```

Use `VALIDATION_USER_ID` when you want the check to be scoped to one real trader instead of all active launch-range rules in the project.

## What the harness checks

- `ENGINE_STATUS_URL` exposes engine evaluator sync state
- `/readyz` becomes green when persisted-rule syncing is healthy and `VALIDATION_EXPECT_READY=true`
- engine `ruleSource` matches `supabase-alert-rules`
- engine exposes a successful `lastRuleSyncAt` and no `lastRuleSyncErr`
- Supabase returns active `stacked_imbalance` rules inside the launch symbol and timeframe scope
- persisted-rule rows satisfy the engine launch contract
- engine configured rule count matches the active persisted-rule count for the validated scope

## Commands

```bash
node scripts/validate-goal-6.mjs
```

Windows helper:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-goal-6-validation.ps1
```

## Artifacts

- JSON report at `VALIDATION_REPORT_PATH`
- markdown summary beside the JSON artifact
- stable `goal-6-validation-latest.json`
- stable `goal-6-validation-latest.md`

## Notes

- This harness proves sync fidelity, not alert delivery. Use Goal 8 validation for dispatch and persisted-history proof.
- Misconfigured runs still write evidence artifacts when `VALIDATION_REPORT_PATH` is set, which keeps failed Goal 6 signoff attempts actionable.
