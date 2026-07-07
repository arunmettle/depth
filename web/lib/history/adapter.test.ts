import { describe, expect, it } from "vitest";

import { fromEngineRecentAlert } from "@/lib/history/adapter";

describe("history adapter", () => {
  it("maps an engine recent alert into the web alert record shape", () => {
    const record = fromEngineRecentAlert({
      createdAt: "2026-07-05T06:02:00Z",
      deliveryStatus: "evaluated",
      id: "record-1",
      marketSymbol: "BTCUSDT",
      message: "BTCUSDT 1m buy stacked imbalance confirmed.",
      proof: {
        content: "<svg></svg>",
        contentHash: "hash-123",
        height: 960,
        mediaType: "image/svg+xml",
        width: 720,
      },
      ruleName: "BTC 1m stacked imbalance",
      side: "buy",
      timeframe: "1m",
      tradePlan: {
        entryPrice: 64250.5,
        riskReward1: 1,
        riskReward2: 2,
        signalHigh: 64310,
        signalLow: 64180,
        stopLoss: 64120.25,
        takeProfit1: 64380.75,
        takeProfit2: 64511,
        triggerPrice: 64250.5,
      },
    });

    expect(record.id).toBe("record-1");
    expect(record.deliveryStatus).toBe("evaluated");
    expect(record.proof.contentHash).toBe("hash-123");
    expect(record.tradePlan?.entryPrice).toBe(64250.5);
  });
});
