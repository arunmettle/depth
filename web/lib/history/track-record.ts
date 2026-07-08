import type { AlertRecord } from "@/lib/history/schema";

export type TrackRecordPoint = {
  createdAt: string;
  cumulativeR: number;
  id: string;
};

export type TrackRecordSummary = {
  averageRMultiple: number | null;
  equityCurve: TrackRecordPoint[];
  expiredCount: number;
  losses: number;
  pendingCount: number;
  resolvedCount: number;
  totalRMultiple: number;
  wins: number;
  winRatePercent: number | null;
};

export type RuleTypeTrackRecord = {
  ruleType: AlertRecord["ruleType"];
  summary: TrackRecordSummary;
};

/**
 * Summarizes real tracked outcomes (see engine/internal/outcome) across a
 * set of alert history items. Every number here reflects whether the
 * stop-loss or a take-profit level was actually touched afterward in real
 * Bybit price history - never an estimate or backtest assumption.
 */
export function summarizeTrackRecord(items: AlertRecord[]): TrackRecordSummary {
  const sorted = [...items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let wins = 0;
  let losses = 0;
  let expiredCount = 0;
  let pendingCount = 0;
  let totalR = 0;
  let cumulativeR = 0;

  const equityCurve: TrackRecordPoint[] = [];

  for (const item of sorted) {
    const outcome = item.outcome;

    if (!outcome || outcome.status === "pending") {
      pendingCount += 1;
      continue;
    }

    if (outcome.status === "expired") {
      expiredCount += 1;
      continue;
    }

    const rMultiple = outcome.rMultiple ?? 0;
    totalR += rMultiple;
    cumulativeR += rMultiple;

    if (outcome.status === "tp1_hit" || outcome.status === "tp2_hit") {
      wins += 1;
    } else if (outcome.status === "stop_hit") {
      losses += 1;
    }

    equityCurve.push({
      createdAt: item.createdAt,
      cumulativeR,
      id: item.id,
    });
  }

  const resolvedCount = wins + losses;

  return {
    averageRMultiple: resolvedCount > 0 ? totalR / resolvedCount : null,
    equityCurve,
    expiredCount,
    losses,
    pendingCount,
    resolvedCount,
    totalRMultiple: totalR,
    wins,
    winRatePercent: resolvedCount > 0 ? (wins / resolvedCount) * 100 : null,
  };
}

/**
 * Breaks the same real-outcome summary down per rule type (e.g.
 * stacked_imbalance vs trapped_traders) so users can see which alpha
 * strategy is actually carrying the edge instead of only a single blended
 * aggregate. Only rule types actually present in the given items are
 * returned, ordered by resolved-alert count (most active first).
 */
export function summarizeTrackRecordByRuleType(items: AlertRecord[]): RuleTypeTrackRecord[] {
  const byRuleType = new Map<AlertRecord["ruleType"], AlertRecord[]>();

  for (const item of items) {
    const bucket = byRuleType.get(item.ruleType);
    if (bucket) {
      bucket.push(item);
    } else {
      byRuleType.set(item.ruleType, [item]);
    }
  }

  return Array.from(byRuleType.entries())
    .map(([ruleType, ruleItems]) => ({
      ruleType,
      summary: summarizeTrackRecord(ruleItems),
    }))
    .sort((a, b) => b.summary.resolvedCount - a.summary.resolvedCount);
}
