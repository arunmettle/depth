import type {
  AlertDeliveryStatus,
  AlertRecord,
  ProofArtifact,
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
