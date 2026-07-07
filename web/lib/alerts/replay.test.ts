import { describe, expect, it } from "vitest";

import type { AlertRule } from "@/lib/alerts/schema";
import { buildReplayPreview } from "@/lib/alerts/replay";

const baseRule: AlertRule = {
  createdAt: "2026-07-07T00:00:00Z",
  destination: "telegram",
  id: "rule-1",
  marketSymbol: "BTCUSDT",
  name: "BTC 1m stacked imbalance",
  params: {
    confirmationRows: 3,
    thresholdMultiplier: 300,
  },
  ruleType: "stacked_imbalance",
  status: "active",
  timeframe: "1m",
  updatedAt: "2026-07-07T00:00:00Z",
  userId: "user-1",
};

describe("buildReplayPreview", () => {
  it("returns a confidence preview when replay finds valid signals", () => {
    const trades = [
      trade("2026-07-07T00:00:05Z", "Buy", 12, 100),
      trade("2026-07-07T00:00:15Z", "Sell", 2, 101),
      trade("2026-07-07T00:01:05Z", "Buy", 11, 102),
      trade("2026-07-07T00:01:15Z", "Sell", 2, 103),
      trade("2026-07-07T00:02:05Z", "Buy", 10, 104),
      trade("2026-07-07T00:02:15Z", "Sell", 2, 105),
      trade("2026-07-07T00:03:05Z", "Buy", 8, 107),
      trade("2026-07-07T00:03:15Z", "Sell", 3, 108),
      trade("2026-07-07T00:04:05Z", "Buy", 6, 109),
      trade("2026-07-07T00:04:15Z", "Sell", 4, 110),
      trade("2026-07-07T00:05:05Z", "Buy", 7, 111),
      trade("2026-07-07T00:05:15Z", "Sell", 5, 112),
    ];

    const preview = buildReplayPreview(baseRule, trades);

    expect(preview.status).toBe("ready");
    expect(preview.headline).toBe("Replay confidence preview");
    expect(preview.metrics.some((metric) => metric.label === "Signals")).toBe(true);
    expect(preview.detail).toContain("trigger");
  });

  it("returns an insufficient preview when too few completed candles exist", () => {
    const trades = [
      trade("2026-07-07T00:00:05Z", "Buy", 12, 100),
      trade("2026-07-07T00:01:05Z", "Buy", 11, 102),
      trade("2026-07-07T00:02:05Z", "Buy", 10, 104),
    ];

    const preview = buildReplayPreview(baseRule, trades);

    expect(preview.status).toBe("insufficient");
    expect(preview.headline).toBe("Sample still building");
  });

  it("returns a selective-ready preview when no triggers appear", () => {
    const trades = [
      trade("2026-07-07T00:00:05Z", "Buy", 5, 100),
      trade("2026-07-07T00:00:15Z", "Sell", 4, 99),
      trade("2026-07-07T00:01:05Z", "Buy", 5, 101),
      trade("2026-07-07T00:01:15Z", "Sell", 4, 100),
      trade("2026-07-07T00:02:05Z", "Buy", 5, 102),
      trade("2026-07-07T00:02:15Z", "Sell", 4, 101),
      trade("2026-07-07T00:03:05Z", "Buy", 5, 103),
      trade("2026-07-07T00:03:15Z", "Sell", 4, 102),
      trade("2026-07-07T00:04:05Z", "Buy", 5, 104),
      trade("2026-07-07T00:04:15Z", "Sell", 4, 103),
    ];

    const preview = buildReplayPreview(baseRule, trades);

    expect(preview.status).toBe("ready");
    expect(preview.headline).toBe("No recent trigger in sample");
  });
});

function trade(timestamp: string, side: "Buy" | "Sell", size: number, price: number) {
  return {
    price,
    side,
    size,
    timestamp: new Date(timestamp),
  };
}
