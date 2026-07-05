create table if not exists public.telegram_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  telegram_chat_id text not null unique,
  telegram_username text,
  telegram_first_name text,
  connected_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now())
);

alter table public.telegram_connections enable row level security;

create policy "telegram connections are readable by owner"
on public.telegram_connections
for select
to authenticated
using (auth.uid() = user_id);

create policy "telegram connections are deletable by owner"
on public.telegram_connections
for delete
to authenticated
using (auth.uid() = user_id);
