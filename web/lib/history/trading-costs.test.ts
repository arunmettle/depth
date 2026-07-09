import { describe, expect, it } from "vitest";

import { computeNetRMultiple, REALISTIC_ROUND_TRIP_COST_PERCENT } from "@/lib/history/trading-costs";
import type { AlertRecord } from "@/lib/history/schema";

function buildAlert(overrides: Partial<AlertRecord>): AlertRecord {
  return {
    createdAt: "2026-07-05T06:00:00Z",
    deliveryStatus: "delivered",
    id: "alert-1",
    marketSymbol: "BTCUSDT",
    message: "BTCUSDT 1m buy stacked imbalance confirmed across 3 candles.",
    proof: {
      content: "<svg></svg>",
      contentHash: "hash-123",
      height: 960,
      mediaType: "image/svg+xml",
      width: 720,
    },
    ruleName: "BTC 1m stacked imbalance",
    ruleType: "stacked_imbalance",
    side: "buy",
    timeframe: "1m",
    ...overrides,
  };
}

describe("computeNetRMultiple", () => {
  it("returns null when there is no resolved R-multiple", () => {
    const alert = buildAlert({
      outcome: { status: "pending" },
      tradePlan: {
        entryPrice: 100000,
        riskReward1: 1,
        riskReward2: 2,
        signalHigh: 100010,
        signalLow: 99250,
        stopLoss: 99250,
        takeProfit1: 100750,
        takeProfit2: 101500,
        triggerPrice: 100000,
      },
    });

    expect(computeNetRMultiple(alert)).toBeNull();
  });

  it("returns null when there is no trade plan", () => {
    const alert = buildAlert({ outcome: { status: "tp1_hit", rMultiple: 1 } });

    expect(computeNetRMultiple(alert)).toBeNull();
  });

  it("subtracts the modeled round-trip cost, sized in R, from the gross R-multiple", () => {
    const entryPrice = 100000;
    const stopLoss = 99250; // 0.75% risk distance, matching the engine's minimum floor
    const alert = buildAlert({
      outcome: { status: "tp1_hit", rMultiple: 1 },
      tradePlan: {
        entryPrice,
        riskReward1: 1,
        riskReward2: 2,
        signalHigh: 100010,
        signalLow: stopLoss,
        stopLoss,
        takeProfit1: 100750,
        takeProfit2: 101500,
        triggerPrice: entryPrice,
      },
    });

    const riskDistance = entryPrice - stopLoss;
    const expectedCostInR = ((REALISTIC_ROUND_TRIP_COST_PERCENT / 100) * entryPrice) / riskDistance;

    expect(computeNetRMultiple(alert)).toBeCloseTo(1 - expectedCostInR);
  });

  it("returns null when the trade plan has a zero-width stop", () => {
    const alert = buildAlert({
      outcome: { status: "tp1_hit", rMultiple: 1 },
      tradePlan: {
        entryPrice: 100000,
        riskReward1: 1,
        riskReward2: 2,
        signalHigh: 100000,
        signalLow: 100000,
        stopLoss: 100000,
        takeProfit1: 100000,
        takeProfit2: 100000,
        triggerPrice: 100000,
      },
    });

    expect(computeNetRMultiple(alert)).toBeNull();
  });
});
