# Goal 4: Alert Rules

This slice introduces production-scoped alert rule configuration.

## Included

- owner-scoped `alert_rules` table
- RLS-backed create, update, and delete flows
- guided rule builder for v1 rule types
- rules list and edit path on `/alerts`
- active rule visibility on `/dashboard`
- shared launch-range validation for alert names and rule parameters

## Supported v1 scope

- Markets: BTCUSDT, ETHUSDT
- Timeframes: 1m, 5m, 15m
- Rule types: stacked imbalance, trapped traders
- Destination: Telegram only

## Launch guardrails

- Rule names: 3 to 80 characters
- Stacked imbalance threshold: 150% to 1000%
- Stacked imbalance confirmation rows: 2 to 6
- Trapped traders absorption volume: 10,000 to 10,000,000

These limits keep the saved rule set small, explainable, and easier to validate against the engine later.

## Validation harness

Goal 4 now has a lightweight validation script at `scripts/validate-goal-4.mjs`.

Required environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
VALIDATION_USER_ID=...
VALIDATION_REPORT_PATH=artifacts/goal-4-validation-20260706-000000.json
```

Optional CRUD exercise:

```bash
VALIDATION_EXERCISE_CRUD=true
VALIDATION_RULE_MARKET=BTCUSDT
VALIDATION_RULE_TIMEFRAME=5m
VALIDATION_RULE_TYPE=stacked_imbalance
VALIDATION_RULE_STATUS=active
```

What it checks:

- Supabase `alert_rules`
- Optional owner-scoped `alert_rules` validation through `VALIDATION_USER_ID`
- Optional live create, read-back, update, and delete of a temporary validation rule when `VALIDATION_EXERCISE_CRUD=true`

Commands:

```bash
node scripts/validate-goal-4.mjs
```

Windows helper:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-goal-4-validation.ps1
```

To exercise live CRUD from Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-goal-4-validation.ps1 -ExerciseCrud
```

Artifacts:

- JSON report at the configured `VALIDATION_REPORT_PATH`
- Markdown summary beside the JSON artifact
- Stable `*-latest.json` and `*-latest.md` copies for the newest run
