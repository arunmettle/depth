export type ProofArtifact = {
  content: string;
  contentHash: string;
  height: number;
  mediaType: "image/svg+xml" | "image/png";
  width: number;
};

export type TradePlan = {
  entryPrice: number;
  riskReward1: number;
  riskReward2: number;
  signalHigh: number;
  signalLow: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  triggerPrice: number;
};

export type AlertDeliveryStatus =
  | "delivered"
  | "evaluated"
  | "queued"
  | "retrying";

export type OutcomeStatus =
  | "pending"
  | "tp1_hit"
  | "tp2_hit"
  | "stop_hit"
  | "expired";

export type AlertOutcome = {
  status: OutcomeStatus;
  hitPrice?: number;
  hitAt?: string;
  rMultiple?: number;
  checkedAt?: string;
  note?: string;
};

export type AlertRecord = {
  createdAt: string;
  deliveryStatus: AlertDeliveryStatus;
  id: string;
  marketSymbol: "BTCUSDT" | "ETHUSDT";
  message: string;
  outcome?: AlertOutcome;
  proof: ProofArtifact;
  ruleName: string;
  ruleType: "stacked_imbalance" | "trapped_traders";
  side: "buy" | "sell";
  timeframe: "1m" | "5m" | "15m";
  tradePlan?: TradePlan;
};

export type AlertHistoryItem = AlertRecord;

export type EngineRecentAlertRecord = AlertRecord;
