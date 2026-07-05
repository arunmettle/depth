import type { AlertDeliveryStatus, AlertRecord } from "@/lib/history/schema";

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
