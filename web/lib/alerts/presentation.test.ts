import { describe, expect, it } from "vitest";

import { describeAlertRule } from "@/lib/alerts/presentation";
import type { AlertRule } from "@/lib/alerts/schema";

function buildRule(overrides: Partial<AlertRule>): AlertRule {
  return {
    createdAt: "2026-07-05T00:00:00.000Z",
    destination: "telegram",
    id: "rule-1",
    marketSymbol: "BTCUSDT",
    name: "Test rule",
    params: {
      confirmationRows: 3,
      thresholdMultiplier: 300,
    },
    ruleType: "stacked_imbalance",
    status: "active",
    timeframe: "5m",
    updatedAt: "2026-07-05T00:00:00.000Z",
    userId: "user-1",
    ...overrides,
  };
}

describe("describeAlertRule", () => {
  it("describes stacked imbalance rules", () => {
    const description = describeAlertRule(
      buildRule({
        params: {
          confirmationRows: 4,
          thresholdMultiplier: 325,
        },
        ruleType: "stacked_imbalance",
      })
    );

    expect(description).toBe("Stacked imbalance at 325% across 4 rows");
  });

  it("describes trapped trader rules", () => {
    const description = describeAlertRule(
      buildRule({
        params: {
          minAbsorptionVolume: 250000,
          trapSide: "buyers",
        },
        ruleType: "trapped_traders",
      })
    );

    expect(description).toBe(
      "Trapped traders on buyers with min absorption 250000"
    );
  });
});
