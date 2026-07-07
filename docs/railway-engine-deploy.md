# Railway Engine Deploy

This is the simplest production-safe way to run the Sentinel Flow engine as an always-on Railway service.

## Why this setup

- The web app on Vercel is request-driven.
- The engine is a long-running Go process that keeps a live Bybit WebSocket open.
- Railway is a good fit for an always-on single service with HTTP health endpoints.

## Files now included

- [engine/Dockerfile](/C:/Dev/Depth/engine/Dockerfile)
- [engine/.dockerignore](/C:/Dev/Depth/engine/.dockerignore)
- [engine/railway.json](/C:/Dev/Depth/engine/railway.json)

## Railway service setup

Railway docs say isolated monorepos should use a service root directory, Dockerfile builds use a `Dockerfile` in that source root, and healthchecks should point at an endpoint that returns `200` before a deploy is made active. See:

- [Deploying a Monorepo](https://docs.railway.com/deployments/monorepo)
- [Dockerfiles](https://docs.railway.com/builds/dockerfiles)
- [Healthchecks](https://docs.railway.com/deployments/healthchecks)
- [Config as Code](https://docs.railway.com/config-as-code/reference)

## Create the service

1. In Railway, create a new service from the GitHub repo `arunmettle/depth`.
2. Open the service settings.
3. Set `Root Directory` to `engine`.
4. Set `Config as Code File` to `/engine/railway.json`.
5. Confirm the service is using the repository branch you want, usually `main`.

## Required variables

Set these in the Railway service variables:

- `APP_ENV=production`
- `HOST=0.0.0.0`
- `LOG_LEVEL=info`
- `BYBIT_SYMBOLS=BTCUSDT,ETHUSDT`
- `SUPABASE_URL=...`
- `SUPABASE_SECRET_KEY=...`
- `TELEGRAM_BOT_TOKEN=...`

## Optional but recommended variables

- `RULE_SYNC_INTERVAL=1m`
- `PING_INTERVAL=20s`
- `TELEGRAM_BASE_URL=https://api.telegram.org`
- `VALIDATION_API_KEY=...`

Do not hardcode `PORT`. Railway injects `PORT`, and the engine already reads it.

## First deploy checks

After the first deploy:

1. Open the Railway public domain for the engine.
2. Check `/healthz`
3. Check `/readyz`

Expected behavior:

- `/healthz` should return HTTP `200`
- `/readyz` may briefly return warming until market data and rule sync are live
- once connected and synced, `/readyz` should return HTTP `200`

## Wire the web app to the engine

After Railway gives you a public engine URL, set this in the web deployment environment:

- `ENGINE_STATUS_URL=https://your-engine-domain/healthz`

That enables the web app to surface live engine status and delivery visibility.

## Validate after deploy

Run the existing validation scripts against the real Railway engine URL:

1. Goal 5 engine boot and readiness
2. Goal 6 rule sync
3. Goal 7 proof contract
4. Goal 8 Telegram delivery

Relevant files:

- [docs/validation.env.example](/C:/Dev/Depth/docs/validation.env.example)
- [scripts/validate-goal-5.mjs](/C:/Dev/Depth/scripts/validate-goal-5.mjs)
- [scripts/validate-goal-6.mjs](/C:/Dev/Depth/scripts/validate-goal-6.mjs)
- [scripts/validate-goal-7.mjs](/C:/Dev/Depth/scripts/validate-goal-7.mjs)
- [scripts/validate-goal-8.mjs](/C:/Dev/Depth/scripts/validate-goal-8.mjs)

## Notes

- The engine is intentionally one service. Do not split it yet.
- Keep one replica until live behavior is proven. Multiple replicas would duplicate market-stream evaluation and delivery.
- If you want zero-downtime deploy confidence, keep the healthcheck on `/healthz` and use `/readyz` as an operator check after deploy.
