# Sentinel Flow Web

Sentinel Flow web is the Next.js surface for onboarding, configuration, proof history, and billing.

## Stack

- Next.js
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- Supabase SSR auth wiring

## Local setup

1. Copy `.env.example` to `.env.local`
2. Add `NEXT_PUBLIC_SUPABASE_URL`
3. Add `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Add `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` for Telegram persistence
5. Add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, and `TELEGRAM_LINK_SECRET` for Telegram linking
6. Add `TELEGRAM_WEBHOOK_SECRET` and configure the same value on the Telegram webhook for request verification
7. Run `pnpm dev`

Webhook helper:

```bash
node ..\\scripts\\configure-telegram-webhook.mjs
```

If Supabase credentials are not present, the shell still builds and clearly reports that auth is not configured yet.

## Current status

- production shell scaffolded
- Supabase SSR helpers in place
- sign-in route and callback flow in place
- dashboard, alerts, history, settings, and billing routes reserved
- Telegram deep-link and webhook persistence slice scaffolded
- Telegram webhook secret verification support added for production hardening
- Goal 3 Telegram validation harness added for bot, webhook, and persistence setup checks
- Telegram connect links are now minted on demand through `/api/telegram/connect` to reduce expired-token pairing failures
- Telegram pairing now preserves a safe return path through sign-in so users land back on Settings before retrying connect
- Goal 4 alert-rule validation harness added for Supabase read checks and optional live CRUD validation

The next product slice is Telegram connection followed by rule configuration.
