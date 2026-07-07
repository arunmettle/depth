alter table public.alert_history
  add column if not exists trade_plan_entry_price double precision,
  add column if not exists trade_plan_stop_loss double precision,
  add column if not exists trade_plan_take_profit_1 double precision,
  add column if not exists trade_plan_take_profit_2 double precision,
  add column if not exists trade_plan_signal_low double precision,
  add column if not exists trade_plan_signal_high double precision,
  add column if not exists trade_plan_trigger_price double precision,
  add column if not exists trade_plan_risk_reward_1 double precision,
  add column if not exists trade_plan_risk_reward_2 double precision;
