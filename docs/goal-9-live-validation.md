# Goal 9 Live Billing Validation

This document defines the repeatable signoff flow for Sentinel Flow billing before a real Founding Access release.

## What this validation proves

- The billing route is reachable from the running web app
- Stripe credentials are valid for the configured account
- Expected launch plan price IDs resolve to live recurring Stripe prices
- Supabase `billing_accounts` persistence is reachable and structurally valid
- Billing evidence can be saved as JSON and markdown artifacts for launch review

## Required environment

```bash
VALIDATION_SITE_URL=http://127.0.0.1:3000
STRIPE_SECRET_KEY=...
STRIPE_SCOUT_PRICE_ID=price_...
STRIPE_FOUNDING_ACCESS_PRICE_ID=price_...
STRIPE_SENTINEL_PRO_PRICE_ID=price_...
VALIDATION_REPORT_PATH=artifacts/goal-9-validation.json
```

## Optional environment

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=...
VALIDATION_USER_ID=...
VALIDATION_EXPECT_PLAN_KEYS=scout,founding_access,sentinel_pro
```

Notes:

- `STRIPE_ALPHA_STREAM_PRICE_ID` is intentionally optional while Alpha Stream remains sales-led.
- Add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` when you want the harness to compare live Stripe configuration against persisted `billing_accounts` rows.
- Use `VALIDATION_USER_ID` to scope the Supabase billing check to one real trader account.
- If `VALIDATION_REPORT_PATH` is set, the harness writes timestamped JSON and markdown artifacts plus stable `*-latest` copies.

## Commands

```bash
node scripts/validate-goal-9.mjs
```

Windows helper:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-goal-9-validation.ps1
```

## What the harness checks

- `GET /billing` returns `200`
- Stripe account lookup succeeds for `STRIPE_SECRET_KEY`
- Expected Stripe prices are active recurring prices
- Supabase `billing_accounts` rows are readable when Supabase credentials are provided
- Persisted billing rows include at least the expected core identifiers and statuses

## Evidence required for Goal 9 signoff

- Billing route returns `200`
- Stripe account lookup succeeds
- Scout, Founding Access, and Sentinel Pro price IDs resolve successfully
- Those launch prices are active recurring prices
- Supabase `billing_accounts` rows are readable
- At least one real billing record exists after live checkout when validating a real paid account
- Goal 9 JSON and markdown artifacts are preserved for launch review

## Notes

- This harness proves billing configuration and persistence readiness, not a full money-moving customer journey.
- Upgrade, downgrade, renewal, cancellation, and failed-payment lifecycle signoff still require a real live Stripe account flow.
- Misconfigured runs still write evidence artifacts when `VALIDATION_REPORT_PATH` is set, which keeps failed Goal 9 signoff attempts actionable.
