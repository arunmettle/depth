create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  market_symbol text not null check (market_symbol in ('BTCUSDT', 'ETHUSDT')),
  timeframe text not null check (timeframe in ('1m', '5m', '15m')),
  rule_type text not null check (rule_type in ('stacked_imbalance', 'trapped_traders')),
  destination text not null default 'telegram' check (destination in ('telegram')),
  status text not null default 'active' check (status in ('active', 'paused')),
  params jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists alert_rules_user_id_idx on public.alert_rules (user_id);

alter table public.alert_rules enable row level security;

create policy "alert rules are readable by owner"
on public.alert_rules
for select
to authenticated
using (auth.uid() = user_id);

create policy "alert rules are insertable by owner"
on public.alert_rules
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "alert rules are updateable by owner"
on public.alert_rules
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "alert rules are deletable by owner"
on public.alert_rules
for delete
to authenticated
using (auth.uid() = user_id);
