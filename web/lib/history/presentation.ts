import type {
  AlertDeliveryStatus,
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
