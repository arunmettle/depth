# Goal 2: Web Shell

This goal establishes the production-facing web shell for Sentinel Flow.

## Included in this goal

- product-facing landing page
- authenticated shell layout
- Supabase SSR client wiring
- sign-in flow with magic link request
- auth callback route
- sign-out route
- dashboard, alerts, history, settings, and billing route placeholders

## Validation evidence

- `pnpm lint`
- `pnpm build`

## Remaining dependency

Live auth still requires real Supabase project credentials in `.env.local`.
