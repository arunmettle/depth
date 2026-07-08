alter table public.alert_history
  add column if not exists outcome_status text not null default 'pending'
    check (outcome_status in ('pending', 'tp1_hit', 'tp2_hit', 'stop_hit', 'expired')),
  add column if not exists outcome_hit_price double precision,
  add column if not exists outcome_hit_at timestamptz,
  add column if not exists outcome_r_multiple double precision,
  add column if not exists outcome_checked_at timestamptz,
  add column if not exists outcome_note text;

comment on column public.alert_history.outcome_status is
  'Real tracked result of the trade plan against subsequent Bybit price history: pending (not yet resolved), tp1_hit, tp2_hit, stop_hit, or expired (no clear outcome within the resolution window).';
comment on column public.alert_history.outcome_r_multiple is
  'Realized risk-multiple at the point the outcome was resolved, computed from entry/stop distance vs. the exit price. Null while pending or expired.';

create index if not exists alert_history_outcome_status_idx
  on public.alert_history (outcome_status)
  where outcome_status = 'pending';
