import type {
  AlertDeliveryStatus,
  AlertOutcome,
  AlertRecord,
  ProofArtifact,
  TradePlan,
} from "@/lib/history/schema";

export function getDeliveryLabel(status: AlertDeliveryStatus) {
  switch (status) {
    case "delivered":
      return "Delivered";
    case "evaluated":
      return "Evaluated";
    case "queued":
      return "Queued";
    case "retrying":
      return "Retrying";
    default:
      return "Unknown";
  }
}

export function getSideLabel(side: AlertRecord["side"]) {
  return side === "buy" ? "Buy imbalance" : "Sell imbalance";
}

export function getRuleTypeLabel(ruleType: AlertRecord["ruleType"]) {
  return ruleType === "trapped_traders" ? "Trapped traders" : "Stacked imbalance";
}

export function summarizeProof(item: AlertRecord) {
  return `${item.marketSymbol} ${item.timeframe} ${getSideLabel(item.side)}`;
}

export function getProofImageSrc(proof: ProofArtifact) {
  if (!proof.content) {
    return null;
  }

  switch (proof.mediaType) {
    case "image/svg+xml":
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(proof.content)}`;
    case "image/png":
      return `data:image/png;base64,${proof.content}`;
    default:
      return null;
  }
}

export function formatTradePlanPrice(value: number | undefined) {
  if (value === undefined || value === 0) {
    return "N/A";
  }

  return Math.abs(value) >= 1000 ? value.toFixed(2) : value.toFixed(4);
}

export function getTradePlanTiles(tradePlan: TradePlan | undefined) {
  return [
    { label: "Entry", value: formatTradePlanPrice(tradePlan?.entryPrice) },
    { label: "Stop", value: formatTradePlanPrice(tradePlan?.stopLoss) },
    { label: "TP1", value: formatTradePlanPrice(tradePlan?.takeProfit1) },
    { label: "TP2", value: formatTradePlanPrice(tradePlan?.takeProfit2) },
  ];
}

export function getSignalRangeLabel(tradePlan: TradePlan | undefined) {
  if (!tradePlan || (tradePlan.signalLow <= 0 && tradePlan.signalHigh <= 0)) {
    return "N/A";
  }

  return `${formatTradePlanPrice(tradePlan.signalLow)} to ${formatTradePlanPrice(tradePlan.signalHigh)}`;
}

function formatRMultiple(rMultiple: number | undefined) {
  if (rMultiple === undefined) {
    return "";
  }

  const sign = rMultiple > 0 ? "+" : "";
  return `${sign}${rMultiple.toFixed(2)}R`;
}

/**
 * Real tracked outcome badge label. Reflects what actually happened to the
 * trade plan's price levels afterward (per engine/internal/outcome), never
 * a fabricated or estimated result.
 */
export function getOutcomeBadgeLabel(outcome: AlertOutcome | undefined) {
  if (!outcome || outcome.status === "pending") {
    return "Outcome: tracking";
  }

  switch (outcome.status) {
    case "tp1_hit":
      return `TP1 hit ${formatRMultiple(outcome.rMultiple)}`;
    case "tp2_hit":
      return `TP2 hit ${formatRMultiple(outcome.rMultiple)}`;
    case "stop_hit":
      return `Stopped out ${formatRMultiple(outcome.rMultiple)}`;
    case "expired":
      return "No clear outcome";
    default:
      return "Outcome: tracking";
  }
}

export function getOutcomeBadgeVariant(
  outcome: AlertOutcome | undefined
): "default" | "secondary" | "outline" | "destructive" {
  if (!outcome || outcome.status === "pending") {
    return "secondary";
  }

  switch (outcome.status) {
    case "tp1_hit":
    case "tp2_hit":
      return "default";
    case "stop_hit":
      return "destructive";
    case "expired":
      return "outline";
    default:
      return "secondary";
  }
}

export function getOutcomeDetail(outcome: AlertOutcome | undefined) {
  if (!outcome || outcome.status === "pending") {
    return "Still tracking real Bybit price history to see whether the stop or a take-profit level is reached first.";
  }

  switch (outcome.status) {
    case "tp1_hit":
      return `Take-profit 1 was actually reached at ${formatTradePlanPrice(outcome.hitPrice)} before the stop, based on real Bybit price history.`;
    case "tp2_hit":
      return `Take-profit 2 was actually reached at ${formatTradePlanPrice(outcome.hitPrice)} before the stop, based on real Bybit price history.`;
    case "stop_hit":
      return `The stop-loss was actually reached at ${formatTradePlanPrice(outcome.hitPrice)} before any take-profit level, based on real Bybit price history.`;
    case "expired":
      return outcome.note ?? "No stop or take-profit level was reached within the tracking window.";
    default:
      return "";
  }
}
