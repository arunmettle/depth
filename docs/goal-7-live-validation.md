# Goal 7: Live Proof Contract Validation

This runbook gives Goal 7 a repeatable signoff path for proof artifact contract fidelity.

## Required environment

```bash
ENGINE_STATUS_URL=http://127.0.0.1:8080/healthz
VALIDATION_REPORT_PATH=artifacts/goal-7-validation-20260706-000000.json
```

## Optional environment

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=...
VALIDATION_USER_ID=...
VALIDATION_EXPECT_MEDIA_TYPES=image/svg+xml,image/png
VALIDATION_EXPECT_WIDTH=720
VALIDATION_EXPECT_HEIGHT=960
```

Add Supabase variables when you want the same proof contract checked in persisted `alert_history`, not only in live engine status.

## What the harness checks

- engine `recentAlerts` expose proof content, content hash, media type, width, and height
- proof content hashes match the actual proof content
- proof dimensions match the launch artifact contract
- proof media type stays inside the allowed contract
- proof content still looks like SVG proof output
- optional Supabase `alert_history` rows preserve the same proof contract fields

## Commands

```bash
node scripts/validate-goal-7.mjs
```

Windows helper:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-goal-7-validation.ps1
```

## Artifacts

- JSON report at `VALIDATION_REPORT_PATH`
- markdown summary beside the JSON artifact
- stable `goal-7-validation-latest.json`
- stable `goal-7-validation-latest.md`

## Notes

- This harness proves contract fidelity, not Telegram delivery. Use Goal 8 validation for dispatch and persisted-history delivery proof.
- Misconfigured runs still write evidence artifacts when `VALIDATION_REPORT_PATH` is set, so failed Goal 7 signoff attempts remain actionable.
