import type {
  AlertRecord,
  EngineRecentAlertRecord,
} from "@/lib/history/schema";

export function fromEngineRecentAlert(record: EngineRecentAlertRecord): AlertRecord {
  return {
    createdAt: record.createdAt,
    deliveryStatus: record.deliveryStatus,
    id: record.id,
    marketSymbol: record.marketSymbol,
    message: record.message,
    outcome: record.outcome,
    proof: {
      content: record.proof.content,
      contentHash: record.proof.contentHash,
      height: record.proof.height,
      mediaType: record.proof.mediaType,
      width: record.proof.width,
    },
    ruleName: record.ruleName,
    side: record.side,
    timeframe: record.timeframe,
    tradePlan: record.tradePlan,
  };
}
