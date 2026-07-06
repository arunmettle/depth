import { describe, expect, it } from "vitest";

import {
  getDeliveryLabel,
  getProofImageSrc,
  getSideLabel,
  summarizeProof,
} from "@/lib/history/presentation";
import type { AlertRecord } from "@/lib/history/schema";

const historyItem: AlertRecord = {
  createdAt: "2026-07-05T06:02:00Z",
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
  side: "buy",
  timeframe: "1m",
};

describe("history presentation", () => {
  it("labels delivery status for display", () => {
    expect(getDeliveryLabel("delivered")).toBe("Delivered");
    expect(getDeliveryLabel("retrying")).toBe("Retrying");
  });

  it("labels signal side for display", () => {
    expect(getSideLabel("buy")).toBe("Buy imbalance");
    expect(getSideLabel("sell")).toBe("Sell imbalance");
  });

  it("summarizes a proof item for compact cards", () => {
    expect(summarizeProof(historyItem)).toBe("BTCUSDT 1m Buy imbalance");
  });

  it("renders svg proof artifacts through a data url instead of raw html injection", () => {
    expect(getProofImageSrc(historyItem.proof)).toBe(
      "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E"
    );
  });

  it("returns null when proof content is missing", () => {
    expect(
      getProofImageSrc({
        content: "",
        contentHash: "hash-123",
        height: 960,
        mediaType: "image/svg+xml",
        width: 720,
      })
    ).toBeNull();
  });
});
