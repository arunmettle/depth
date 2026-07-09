import type { AlertRecord } from "@/lib/history/schema";

/**
 * Realistic Bybit round-trip cost (taker fees + slippage) as a percent of
 * notional, matching the "Realistic" scenario in
 * docs/PROFITABILITY_AFTER_COSTS.md. Used to show users the net-of-costs
 * R-multiple alongside the gross (price-only) R-multiple, since gross R
 * alone can look profitable while trading costs quietly erase the edge.
 */
export const REALISTIC_ROUND_TRIP_COST_PERCENT = 0.15;

/**
 * Converts a resolved alert's gross R-multiple into a net-of-costs
 * R-multiple, using the alert's own trade plan (entry/stop) to size the
 * cost in R terms. Returns null when there isn't enough data (no trade
 * plan, no resolved R-multiple, or a zero-width stop).
 */
export function computeNetRMultiple(item: AlertRecord): number | null {
  const rMultiple = item.outcome?.rMultiple;
  const tradePlan = item.tradePlan;

  if (rMultiple === undefined || !tradePlan) {
    return null;
  }

  const riskDistance = Math.abs(tradePlan.entryPrice - tradePlan.stopLoss);
  if (riskDistance === 0) {
    return null;
  }

  const costInR =
    ((REALISTIC_ROUND_TRIP_COST_PERCENT / 100) * tradePlan.entryPrice) / riskDistance;

  return rMultiple - costInR;
}
