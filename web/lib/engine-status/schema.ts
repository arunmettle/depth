export type EngineDeliveryState = {
  dispatchAttempts: number;
  deliveredAlerts: number;
  lastAlertId?: string;
  lastDeliveryAt?: string;
  lastDeliveryErr?: string;
  lastDeliveryStatus?: "delivered" | "evaluated" | "queued" | "retrying";
  lastPersistAt?: string;
  lastPersistErr?: string;
  persistedWrites: number;
  retryAttempts: number;
};

export type EngineEvaluatorState = {
  configuredRules: number;
  lastRuleSyncAt?: string;
  lastRuleSyncErr?: string;
  recentAlerts?: Array<{ id: string; deliveryStatus: string }>;
  ruleSource?: string;
};

export type EngineStreamState = {
  connected: boolean;
  delivery?: EngineDeliveryState;
  evaluator?: EngineEvaluatorState;
  lastMessageAt?: string;
};

export type EngineStatusPayload = {
  status?: string;
  stream?: EngineStreamState;
};

export type EngineRuntimeSummary = {
  connected: boolean;
  deliveryStatus: "configured" | "degraded" | "idle" | "unavailable";
  dispatchAttempts: number;
  deliveredAlerts: number;
  lastDeliveryStatus: string | null;
  persistedWrites: number;
  recentAlertCount: number;
  retryAttempts: number;
  ruleSource: string | null;
  source: "engine" | "unavailable";
};
