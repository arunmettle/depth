import { describe, expect, it } from "vitest";

import type { AlertRule } from "@/lib/alerts/schema";
import {
  buildReplayPreview,
  findReplayPreviewForRuleName,
  getReplayBadgeLabel,
} from "@/lib/alerts/replay";
import type { AlertReplayPreview } from "@/lib/alerts/replay";

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

describe("findReplayPreviewForRuleName", () => {
  it("finds the matching rule's preview by rule name", () => {
    const previews = new Map<string, AlertReplayPreview>([
      [
        "rule-1",
        {
          detail: "detail",
          disclaimer: "disclaimer",
          headline: "Replay confidence preview",
          metrics: [{ label: "Follow-through", value: "67%" }],
          status: "ready",
        },
      ],
    ]);

    const match = findReplayPreviewForRuleName([baseRule], previews, "BTC 1m stacked imbalance");
    expect(match?.headline).toBe("Replay confidence preview");
  });

  it("returns undefined when no rule matches the given name", () => {
    const previews = new Map<string, AlertReplayPreview>();
    const match = findReplayPreviewForRuleName([baseRule], previews, "unknown rule");
    expect(match).toBeUndefined();
  });
});

describe("getReplayBadgeLabel", () => {
  it("labels a ready preview with follow-through metric", () => {
    const preview: AlertReplayPreview = {
      detail: "detail",
      disclaimer: "disclaimer",
      headline: "Replay confidence preview",
      metrics: [{ label: "Follow-through", value: "67%" }],
      status: "ready",
    };

    expect(getReplayBadgeLabel(preview)).toBe("Replay: 67% follow-through");
  });

  it("labels a ready preview with no signals as selective", () => {
    const preview: AlertReplayPreview = {
      detail: "detail",
      disclaimer: "disclaimer",
      headline: "No recent trigger in sample",
      metrics: [{ label: "Sample window", value: "6h" }],
      status: "ready",
    };

    expect(getReplayBadgeLabel(preview)).toBe("Replay: selective (no recent trigger)");
  });

  it("labels an insufficient preview as building sample", () => {
    const preview: AlertReplayPreview = {
      detail: "detail",
      disclaimer: "disclaimer",
      headline: "Sample still building",
      metrics: [],
      status: "insufficient",
    };

    expect(getReplayBadgeLabel(preview)).toBe("Replay: building sample");
  });

  it("labels an unavailable preview", () => {
    const preview: AlertReplayPreview = {
      detail: "detail",
      disclaimer: "disclaimer",
      headline: "Replay sample unavailable",
      metrics: [],
      status: "unavailable",
    };

    expect(getReplayBadgeLabel(preview)).toBe("Replay unavailable");
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
