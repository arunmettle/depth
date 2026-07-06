# Founding Access Launch Checklist

This checklist turns Sentinel Flow’s production-readiness work into one operator runbook for a real Founding Access release.

## Release Intent

- Launch audience: a small set of real traders, not a broad public blast
- Launch promise: mobile-first order-flow alerts with Telegram delivery, proof history, and clear plan gating
- Launch standard: no marketing claims beyond the evidence captured by Goal 5 to Goal 10 validation artifacts

## 1. Environment Readiness

- [ ] Production web URL is decided and reachable
- [ ] Production engine URL is decided and reachable
- [ ] Supabase production project is created
- [ ] Telegram bot token and webhook secret are configured
- [ ] Stripe secret key and launch price IDs are configured
- [ ] Shared validation variables are staged from [validation.env.example](/C:/Dev/Depth/docs/validation.env.example)

## 2. Product Configuration

- [ ] At least one real trader account can sign in successfully
- [ ] Telegram pairing works for the release operator account
- [ ] At least one active launch-scope alert rule exists for the validation user
- [ ] Billing plans shown in the app match the intended release pricing
- [ ] Scout active-rule cap and paid-plan gating behave as expected
- [ ] History pages load and show the proof-review surface correctly

## 3. Service Validation

- [ ] Goal 5 live engine validation passes
- [ ] Goal 6 persisted-rule sync validation passes
- [ ] Goal 7 proof contract validation passes
- [ ] Goal 8 Telegram delivery and persisted-history validation passes
- [ ] Goal 9 billing validation passes
- [ ] Goal 10 launch audit passes with the intended delegated goals enabled

## 4. Evidence Review

- [ ] Latest Goal 5 artifact is present and human-readable
- [ ] Latest Goal 6 artifact is present and human-readable
- [ ] Latest Goal 7 artifact is present and human-readable
- [ ] Latest Goal 8 artifact is present and human-readable
- [ ] Latest Goal 9 artifact is present and human-readable
- [ ] Latest Goal 10 artifact is present and human-readable
- [ ] [launch-evidence-summary.json](/C:/Dev/Depth/artifacts/launch-evidence-summary.json) or a fresh equivalent summary is reviewed
- [ ] No unresolved hard failures remain in the latest evidence set

## 5. Founding Access Decision

- [ ] Founding Access pricing is confirmed for launch
- [ ] Alpha Stream remains sales-led or is explicitly enabled for self-serve
- [ ] Support channel for early traders is decided
- [ ] Known limitations are written down for early users
- [ ] Onboarding path for the first cohort is decided

## 6. Go / No-Go Rules

Go:

- All required validation goals pass with real services
- Billing, Telegram, and engine evidence all reflect the intended production environment
- No unresolved blocker remains in the launch evidence summary

No-Go:

- Any delegated validation goal still fails for the intended production environment
- Billing or Telegram are only locally smoke-tested, not truly production-validated
- The operator cannot explain the latest evidence set in plain language to a release stakeholder

## Suggested Release Sequence

1. Load production validation variables from [validation.env.example](/C:/Dev/Depth/docs/validation.env.example).
2. Run the Goal 10 launch audit or the chained signoff runner.
3. Refresh the launch evidence summary.
4. Review the latest artifacts goal by goal.
5. Confirm the Founding Access business decisions.
6. Approve or delay the release based on the evidence, not on intent.
