import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const SELECT_COLUMNS =
  "id,symbol,rule_type,timeframe,params,period_start,period_end,total_trades_replayed,total_signals,resolved,wins,losses,expired,win_rate,gross_avg_r,net_avg_r,gross_total_r,net_total_r,created_at";

export type BacktestRun = {
  createdAt: string;
  expired: number;
  grossAvgR: number;
  grossTotalR: number;
  id: string;
  losses: number;
  netAvgR: number;
  netTotalR: number;
  params: Record<string, unknown>;
  periodEnd: string;
  periodStart: string;
  resolved: number;
  ruleType: string;
  symbol: string;
  timeframe: string;
  totalSignals: number;
  totalTradesReplayed: number;
  winRate: number;
  wins: number;
};

type BacktestRunRow = {
  created_at: string;
  expired: number;
  gross_avg_r: number;
  gross_total_r: number;
  id: string;
  losses: number;
  net_avg_r: number;
  net_total_r: number;
  params: Record<string, unknown> | null;
  period_end: string;
  period_start: string;
  resolved: number;
  rule_type: string;
  symbol: string;
  timeframe: string;
  total_signals: number;
  total_trades_replayed: number;
  win_rate: number;
  wins: number;
};

function mapRun(row: BacktestRunRow): BacktestRun {
  return {
    createdAt: row.created_at,
    expired: row.expired,
    grossAvgR: row.gross_avg_r,
    grossTotalR: row.gross_total_r,
    id: row.id,
    losses: row.losses,
    netAvgR: row.net_avg_r,
    netTotalR: row.net_total_r,
    params: row.params ?? {},
    periodEnd: row.period_end,
    periodStart: row.period_start,
    resolved: row.resolved,
    ruleType: row.rule_type,
    symbol: row.symbol,
    timeframe: row.timeframe,
    totalSignals: row.total_signals,
    totalTradesReplayed: row.total_trades_replayed,
    winRate: row.win_rate,
    wins: row.wins,
  };
}

/**
 * Fetches every recorded historical backtest run, most recent first. This
 * is intentionally public data (no auth required, no user_id column) - it
 * exists to answer a first-time visitor's "does this actually work?"
 * question with real, replayed-against-real-history numbers before they
 * have any live alert history of their own to look at.
 */
export async function fetchBacktestRuns(): Promise<BacktestRun[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("backtest_runs")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as BacktestRunRow[]).map(mapRun);
}
