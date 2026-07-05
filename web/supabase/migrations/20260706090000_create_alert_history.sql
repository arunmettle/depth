create table if not exists public.alert_history (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  market_symbol text not null check (market_symbol in ('BTCUSDT', 'ETHUSDT')),
  message text not null,
  proof_content text not null,
  proof_content_hash text not null,
  proof_height integer not null check (proof_height > 0),
  proof_media_type text not null check (proof_media_type in ('image/svg+xml', 'image/png')),
  proof_width integer not null check (proof_width > 0),
  rule_name text not null,
  side text not null check (side in ('buy', 'sell')),
  timeframe text not null check (timeframe in ('1m', '5m', '15m')),
  delivery_status text not null check (delivery_status in ('delivered', 'evaluated', 'queued', 'retrying'))
);

create index if not exists alert_history_user_created_idx
  on public.alert_history (user_id, created_at desc);

alter table public.alert_history enable row level security;

create policy "Users can read their own alert history"
  on public.alert_history
  for select
  using (auth.uid() = user_id);
