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
    });

    expect(record.id).toBe("record-1");
    expect(record.deliveryStatus).toBe("evaluated");
    expect(record.proof.contentHash).toBe("hash-123");
  });
});
