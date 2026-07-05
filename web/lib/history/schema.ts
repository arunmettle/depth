export type ProofArtifact = {
  content: string;
  contentHash: string;
  height: number;
  mediaType: "image/svg+xml" | "image/png";
  width: number;
};

export type AlertDeliveryStatus =
  | "delivered"
  | "evaluated"
  | "queued"
  | "retrying";

export type AlertRecord = {
  createdAt: string;
  deliveryStatus: AlertDeliveryStatus;
  id: string;
  marketSymbol: "BTCUSDT" | "ETHUSDT";
  message: string;
  proof: ProofArtifact;
  ruleName: string;
  side: "buy" | "sell";
  timeframe: "1m" | "5m" | "15m";
};

export type AlertHistoryItem = AlertRecord;

export type EngineRecentAlertRecord = AlertRecord;
