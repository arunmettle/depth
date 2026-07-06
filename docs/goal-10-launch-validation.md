# Goal 10 Launch Validation

This document defines the unified launch audit for Sentinel Flow before a public Founding Access release.

## What this validation proves

- The web app still passes its core test and production build gates
- Core launch routes respond successfully from the configured site URL
- Existing live-service validation harnesses for Goals 5, 6, 7, 8, and 9 can be executed from one launch audit
- Goal 10 surfaces a per-goal environment preflight so missing live-service setup is visible before delegated signoff runs fail
- Goal 10 produces one reusable JSON and markdown artifact for release signoff

## Required environment

Set these variables before running the launch audit:

```bash
VALIDATION_SITE_URL=http://127.0.0.1:3000
VALIDATION_ROUTE_PATHS=/,/dashboard,/alerts,/history,/settings,/billing
VALIDATION_INCLUDE_GOALS=5,6,7,8,9
VALIDATION_RUN_WEB_TEST=true
VALIDATION_RUN_WEB_BUILD=true
VALIDATION_REPORT_PATH=artifacts/goal-10-validation.json
```

The delegated goal harnesses also rely on their own existing environment:

- Goal 5: `ENGINE_STATUS_URL`
- Goal 6: Supabase-backed rule validation inputs when using the live path
- Goal 7: engine proof-render validation inputs
- Goal 8: `ENGINE_STATUS_URL`, Supabase credentials, Telegram credentials, and optional trigger variables
- Goal 9: Stripe secret key, launch price IDs, and optional Supabase billing-state inputs

The launch audit now reports a per-goal environment preflight section before delegated results so missing setup is visible immediately.

For a shared starting point, use [validation.env.example](/C:/Dev/Depth/docs/validation.env.example).
For the operator-facing go/no-go runbook, use [founding-access-launch-checklist.md](/C:/Dev/Depth/docs/founding-access-launch-checklist.md).

Notes:

- `VALIDATION_ROUTE_PATHS` can be reduced or expanded, but the default set covers the core launch surfaces.
- `VALIDATION_INCLUDE_GOALS` controls which existing live-service harnesses are delegated from Goal 10.
- If `VALIDATION_REPORT_PATH` is set, the audit writes timestamped JSON and markdown artifacts plus stable `*-latest` copies.
- The shared validation template intentionally includes more variables than any single goal needs so one operator file can support the full launch signoff flow.

## Run the launch audit

From the repository root:

```bash
node scripts/validate-goal-10.mjs
```

Cross-platform chained signoff runner:

```bash
node scripts/run-launch-signoff.mjs
```

Optional flags:

```bash
node scripts/run-launch-signoff.mjs --skip-web-checks
node scripts/run-launch-signoff.mjs --skip-delegated-goals
node scripts/run-launch-signoff.mjs --report-dir artifacts
```

On Windows, you can also use the helper runner:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-goal-10-validation.ps1
```

The helper will:

- stamp a timestamped JSON report path under `artifacts/`
- write a sibling markdown summary next to that JSON artifact
- refresh stable latest JSON and markdown copies in the same directory
- reuse the existing Node launch-audit harness
- leave existing delegated-goal latest artifacts untouched unless those delegated validations are actually run

For a chained operator flow that runs the launch audit and then refreshes the latest evidence summary:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-launch-signoff.ps1
```

Optional switches:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-launch-signoff.ps1 -SkipWebChecks
powershell -ExecutionPolicy Bypass -File .\scripts\run-launch-signoff.ps1 -SkipDelegatedGoals
```

Note:

- The evidence summary reflects the latest Goal 5 to Goal 10 artifacts already on disk. If you skip delegated goals, the summary still surfaces the most recent live-service evidence for those goals rather than pretending they passed in the current run.

To summarize the latest Goal 5 to Goal 10 artifacts without rerunning the validations:

```bash
node scripts/summarize-launch-evidence.mjs
```

Optional summary output artifact:

```bash
VALIDATION_REPORT_PATH=artifacts/launch-evidence-summary.json node scripts/summarize-launch-evidence.mjs
```

## Expected launch-audit flow

1. Start the web app
2. Run `pnpm test` from `web/`
3. Run `pnpm build` from `web/`
4. Fetch and check the configured launch routes
5. Report the per-goal environment preflight for Goals 5 to 9
6. Delegate into the Goal 5, 6, 7, 8, and 9 live validation harnesses
7. Collect one combined Goal 10 artifact that points to the delegated goal artifacts

## Evidence required for Goal 10 signoff

- Web test passes
- Web build passes
- All configured route checks return `200`
- Delegated Goal 5 validation passes
- Delegated Goal 6 validation passes
- Delegated Goal 7 validation passes
- Delegated Goal 8 validation passes
- Delegated Goal 9 validation passes
- Goal 10 JSON and markdown artifacts are preserved for launch review
