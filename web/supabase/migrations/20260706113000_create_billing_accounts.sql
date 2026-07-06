create table if not exists public.billing_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan_key text check (plan_key in ('scout', 'founding_access', 'sentinel_pro', 'alpha_stream')),
  subscription_status text not null default 'inactive' check (subscription_status in ('active', 'canceled', 'incomplete', 'incomplete_expired', 'inactive', 'past_due', 'paused', 'trialing', 'unpaid')),
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists billing_accounts_customer_idx
  on public.billing_accounts (stripe_customer_id);

alter table public.billing_accounts enable row level security;

create policy "billing accounts are readable by owner"
  on public.billing_accounts
  for select
  to authenticated
  using (auth.uid() = user_id);
