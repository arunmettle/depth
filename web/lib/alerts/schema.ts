export const supportedMarkets = ["BTCUSDT", "ETHUSDT"] as const;
export const supportedTimeframes = ["1m", "5m", "15m"] as const;
export const supportedRuleTypes = [
  "stacked_imbalance",
  "trapped_traders",
] as const;
export const supportedStatuses = ["active", "paused"] as const;

export type SupportedMarket = (typeof supportedMarkets)[number];
export type SupportedTimeframe = (typeof supportedTimeframes)[number];
export type SupportedRuleType = (typeof supportedRuleTypes)[number];
export type SupportedStatus = (typeof supportedStatuses)[number];

export type StackedImbalanceParams = {
  confirmationRows: number;
  thresholdMultiplier: number;
};

export type TrappedTradersParams = {
  minAbsorptionVolume: number;
  trapSide: "both" | "buyers" | "sellers";
};

export type AlertRule = {
  createdAt: string;
  destination: "telegram";
  id: string;
  marketSymbol: SupportedMarket;
  name: string;
  params: StackedImbalanceParams | TrappedTradersParams;
  ruleType: SupportedRuleType;
  status: SupportedStatus;
  timeframe: SupportedTimeframe;
  updatedAt: string;
  userId: string;
};
