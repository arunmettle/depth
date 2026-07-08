-- Real, self-recorded Bybit candle history, captured directly from the
-- engine's live public trade WebSocket feed as each candle closes.
--
-- This exists because Bybit's REST kline API (used to check whether a
-- delivered alert's stop-loss/take-profit was actually touched afterward)
-- returns HTTP 403 for every request from Railway's egress IP range, for
-- every published Bybit domain (api.bybit.com, api.bytick.com, and
-- region mirrors) - a datacenter/ASN-level block, not something fixable
-- with request headers. The public WebSocket stream is not affected by
-- that block, so we record the real candles we already receive live and
-- check outcomes against this table instead of calling Bybit's REST API.
create table if not exists public.candle_history (
  market_symbol text not null check (market_symbol in ('BTCUSDT', 'ETHUSDT')),
  timeframe text not null check (timeframe in ('1m', '5m', '15m')),
  bucket_start timestamptz not null,
  open double precision not null,
  high double precision not null,
  low double precision not null,
  close double precision not null,
  buy_volume double precision not null default 0,
  sell_volume double precision not null default 0,
  total_volume double precision not null default 0,
  trades integer not null default 0,
  recorded_at timestamptz not null default now(),
  primary key (market_symbol, timeframe, bucket_start)
);

comment on table public.candle_history is
  'Real Bybit candles recorded directly from the engine''s live public trade WebSocket feed as each candle closes. Used to resolve alert outcomes (stop-loss/take-profit checks) since Bybit''s REST kline API blocks Railway''s egress IP entirely. Only ever contains genuinely observed trades - never fabricated or estimated.';

-- Engine-only table: written by the engine via the service-role key, and
-- not currently read by the web app, so RLS is enabled with no policies -
-- the service role bypasses RLS for writes, and no anon/authenticated
-- access is granted.
alter table public.candle_history enable row level security;
