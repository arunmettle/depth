# Sentinel Flow

Sentinel Flow is a production-first, mobile-first order-flow alert product for serious crypto perpetual traders.

This repository is intentionally small:

- `web/`: Next.js application for onboarding, settings, alert rules, history, and billing
- `engine/`: real-time market ingestion and alert evaluation service
- `docs/`: build contracts and delivery notes

## Product direction

Sentinel Flow v1 is a narrow, premium product:

- Venue: Bybit
- Markets: BTCUSDT, ETHUSDT
- Timeframes: 1m, 5m, 15m
- Alert types: Stacked Imbalance, Trapped Buyers/Sellers
- Delivery: Telegram first, web history second

## Working rules

- Reliability over breadth
- Clarity over customization
- Fewer moving parts over speculative architecture
- Production-ready slices over demo-only breadth

## Runtime baseline

- Node.js `22+` for the `web/` app
- Go `1.26+` for the `engine/` service
- `.nvmrc` files are included at the repo root and in `web/` for local runtime alignment

## Current status

The web app and engine are both now executable, and the current focus is live production validation of Telegram delivery, persisted alert history, and end-to-end reliability.

## Live validation

- Goal 5 engine validation runbook: `docs/goal-5-live-validation.md`
- Goal 5 engine validation script: `node scripts/validate-goal-5.mjs`
- Windows helper runner: `powershell -ExecutionPolicy Bypass -File .\scripts\run-goal-5-validation.ps1`
- Goal 6 persisted-rule validation runbook: `docs/goal-6-live-validation.md`
- Goal 6 persisted-rule validation script: `node scripts/validate-goal-6.mjs`
- Windows helper runner: `powershell -ExecutionPolicy Bypass -File .\scripts\run-goal-6-validation.ps1`
- Goal 7 proof-contract validation runbook: `docs/goal-7-live-validation.md`
- Goal 7 proof-contract validation script: `node scripts/validate-goal-7.mjs`
- Windows helper runner: `powershell -ExecutionPolicy Bypass -File .\scripts\run-goal-7-validation.ps1`
- Goal 8 validation runbook: `docs/goal-8-live-validation.md`
- Goal 8 validation script: `node scripts/validate-goal-8.mjs`
- The script can now optionally trigger a real validation alert first when `VALIDATION_TRIGGER_ALERT=true`
- The harness can also poll until that alert is visible in engine status and persisted history
- Windows helper runner: `powershell -ExecutionPolicy Bypass -File .\scripts\run-goal-8-validation.ps1 -TriggerAlert`
