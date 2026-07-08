import { describe, expect, it } from "vitest";

import { getProductPathState } from "@/lib/product-path";

describe("product path state", () => {
  it("points to settings when Telegram is not connected", () => {
    const result = getProductPathState({
      engine: null,
      historyCount: 0,
      rules: [],
      telegramConnection: null,
    });

    expect(result.complete).toBe(false);
    expect(result.nextAction.href).toBe("/settings");
    expect(result.nextAction.label).toBe("Connect Telegram");
  });

  it("points to alerts when Telegram exists but no active rules exist", () => {
    const result = getProductPathState({
      engine: null,
      historyCount: 0,
      rules: [
        {
          createdAt: "2026-07-06T00:00:00Z",
          destination: "telegram",
          id: "rule-1",
          marketSymbol: "BTCUSDT",
          name: "Draft rule",
          params: {
            confirmationRows: 3,
            thresholdMultiplier: 300,
          },
          ruleType: "stacked_imbalance",
          status: "paused",
          timeframe: "1m",
          updatedAt: "2026-07-06T00:00:00Z",
          userId: "user-1",
        },
      ],
      telegramConnection: {
        connectedAt: "2026-07-06T00:00:00Z",
        firstName: "Arun",
        lastSeenAt: "2026-07-06T00:00:00Z",
        telegramChatId: "12345",
        telegramUsername: "arun",
        userId: "user-1",
      },
    });

    expect(result.nextAction.href).toBe("/alerts");
    expect(result.nextAction.label).toBe("Create first rule");
  });

  it("points to history when the delivery path is live", () => {
    const result = getProductPathState({
      engine: {
        connected: true,
        deliveryStatus: "configured",
        dispatchAttempts: 1,
        deliveredAlerts: 1,
        lastDeliveryStatus: "delivered",
        persistedWrites: 1,
        recentAlertCount: 1,
        retryAttempts: 0,
        ruleSource: "supabase-alert-rules",
        source: "engine",
      },
      historyCount: 2,
      rules: [
        {
          createdAt: "2026-07-06T00:00:00Z",
          destination: "telegram",
          id: "rule-1",
          marketSymbol: "BTCUSDT",
          name: "Live rule",
          params: {
            confirmationRows: 3,
            thresholdMultiplier: 300,
          },
          ruleType: "stacked_imbalance",
          status: "active",
          timeframe: "1m",
          updatedAt: "2026-07-06T00:00:00Z",
          userId: "user-1",
        },
      ],
      telegramConnection: {
        connectedAt: "2026-07-06T00:00:00Z",
        firstName: "Arun",
        lastSeenAt: "2026-07-06T00:00:00Z",
        telegramChatId: "12345",
        telegramUsername: "arun",
        userId: "user-1",
      },
    });

    expect(result.complete).toBe(true);
    expect(result.nextAction.href).toBe("/history");
    expect(result.nextAction.label).toBe("Review recent alerts");
  });
});
