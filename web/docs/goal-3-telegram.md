# Goal 3: Telegram Connection Flow

This document defines the current Telegram connection slice and the minimum production setup required to validate it safely.

## What this goal achieves

- Secure deep-link based Telegram pairing from the settings page
- Telegram `/start` pairing flow
- Connection persistence in Supabase
- Optional webhook request verification for production exposure

## Environment

Add these variables in `web/.env.local`:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=...
TELEGRAM_LINK_SECRET=...
TELEGRAM_WEBHOOK_SECRET=...
```

## Production notes

- `TELEGRAM_LINK_SECRET` signs short-lived deep-link tokens used in Telegram pairing
- The Settings connect action now issues a fresh deep-link token at click time through `/api/telegram/connect`, avoiding stale page-render tokens
- If a user is not signed in when they open the Telegram connect route, the auth flow now returns them to Settings before retrying pairing
- `TELEGRAM_WEBHOOK_SECRET` should be passed to Telegram when configuring the webhook and is checked on inbound requests through `x-telegram-bot-api-secret-token`
- Supabase persistence for Telegram connections uses the admin client rather than the SSR session client
- Each Telegram chat can only be linked to one Sentinel Flow account at a time; duplicate chat-link attempts now return user-facing guidance instead of failing silently
- Reconnecting an already-paired user refreshes `last_seen_at` without rewriting the original `connected_at` timestamp
- The Settings page surfaces `Connected` and `Last seen` in deterministic UTC formatting so pairing history remains clear across environments
- The auth callback and magic-link redirect builder now have direct tests for safe return-path handling

## Live validation checklist

1. Apply Supabase migrations
2. Start the web app
3. Configure the Telegram webhook to point at `/api/telegram/webhook`
4. Include the same `TELEGRAM_WEBHOOK_SECRET` value when setting the webhook
5. Sign into Sentinel Flow and open Settings
6. Click `Connect Telegram bot`
7. Complete the Telegram `/start` flow
8. Confirm the success message arrives in Telegram
9. Refresh Settings and confirm the connection badge and chat details persist
10. Disconnect and confirm the badge returns to the disconnected state

Webhook helper:

```bash
node scripts/configure-telegram-webhook.mjs
```

Optional cleanup:

```bash
node scripts/configure-telegram-webhook.mjs --delete
```

Optional environment:

```bash
TELEGRAM_WEBHOOK_DROP_PENDING_UPDATES=true
```

## Validation harness

Goal 3 now has a lightweight validation script at `scripts/validate-goal-3.mjs`.

Required environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=...
NEXT_PUBLIC_SITE_URL=https://your-site.example
TELEGRAM_WEBHOOK_SECRET=...
VALIDATION_USER_ID=...
VALIDATION_REPORT_PATH=artifacts/goal-3-validation-20260706-000000.json
```

What it checks:

- Telegram `getMe`
- Telegram `getWebhookInfo`
- Bot username matches `TELEGRAM_BOT_USERNAME`
- Webhook URL matches `NEXT_PUBLIC_SITE_URL/api/telegram/webhook` when a site URL is provided
- Supabase `telegram_connections`
- Optional user-scoped `telegram_connections` validation through `VALIDATION_USER_ID`

Commands:

```bash
node scripts/validate-goal-3.mjs
```

Windows helper:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-goal-3-validation.ps1
```

Artifacts:

- JSON report at the configured `VALIDATION_REPORT_PATH`
- Markdown summary beside the JSON artifact
- Stable `*-latest.json` and `*-latest.md` copies for the newest run

## Current hardening in place

- Signed deep-link pairing tokens
- Expiration-aware token verification
- Optional webhook secret verification
- Friendly response for plain `/start` without a pairing token
