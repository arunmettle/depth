import { describe, expect, it } from "vitest";

import { summarizeTrackRecord, summarizeTrackRecordByRuleType } from "@/lib/history/track-record";
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

describe("summarizeTrackRecord", () => {
  it("returns null rates when nothing has resolved yet", () => {
    const summary = summarizeTrackRecord([
      buildAlert({ id: "a", outcome: { status: "pending" } }),
      buildAlert({ id: "b" }),
    ]);

    expect(summary.resolvedCount).toBe(0);
    expect(summary.pendingCount).toBe(2);
    expect(summary.winRatePercent).toBeNull();
    expect(summary.averageRMultiple).toBeNull();
    expect(summary.equityCurve).toEqual([]);
  });

  it("computes win rate, average R, and a cumulative equity curve in chronological order", () => {
    const summary = summarizeTrackRecord([
      buildAlert({
        id: "b",
        createdAt: "2026-07-05T08:00:00Z",
        outcome: { status: "stop_hit", rMultiple: -1 },
      }),
      buildAlert({
        id: "a",
        createdAt: "2026-07-05T06:00:00Z",
        outcome: { status: "tp1_hit", rMultiple: 1.5 },
      }),
      buildAlert({
        id: "c",
        createdAt: "2026-07-05T10:00:00Z",
        outcome: { status: "tp2_hit", rMultiple: 2 },
      }),
      buildAlert({ id: "d", outcome: { status: "expired" } }),
      buildAlert({ id: "e", outcome: { status: "pending" } }),
    ]);

    expect(summary.wins).toBe(2);
    expect(summary.losses).toBe(1);
    expect(summary.resolvedCount).toBe(3);
    expect(summary.expiredCount).toBe(1);
    expect(summary.pendingCount).toBe(1);
    expect(summary.winRatePercent).toBeCloseTo((2 / 3) * 100);
    expect(summary.averageRMultiple).toBeCloseTo((1.5 - 1 + 2) / 3);
    expect(summary.totalRMultiple).toBeCloseTo(2.5);
    expect(summary.equityCurve.map((point) => point.id)).toEqual(["a", "b", "c"]);
    expect(summary.equityCurve.map((point) => Number(point.cumulativeR.toFixed(2)))).toEqual([
      1.5, 0.5, 2.5,
    ]);
  });

  it("treats missing rMultiple as zero without throwing", () => {
    const summary = summarizeTrackRecord([
      buildAlert({ id: "a", outcome: { status: "tp1_hit" } }),
    ]);

    expect(summary.resolvedCount).toBe(1);
    expect(summary.totalRMultiple).toBe(0);
    expect(summary.averageRMultiple).toBe(0);
  });
});

describe("summarizeTrackRecordByRuleType", () => {
  it("groups alerts by rule type and summarizes each independently", () => {
    const breakdown = summarizeTrackRecordByRuleType([
      buildAlert({
        id: "a",
        ruleType: "stacked_imbalance",
        outcome: { status: "tp1_hit", rMultiple: 1 },
      }),
      buildAlert({
        id: "b",
        ruleType: "stacked_imbalance",
        outcome: { status: "stop_hit", rMultiple: -1 },
      }),
      buildAlert({
        id: "c",
        ruleType: "trapped_traders",
        outcome: { status: "tp2_hit", rMultiple: 2 },
      }),
    ]);

    expect(breakdown).toHaveLength(2);

    const stacked = breakdown.find((entry) => entry.ruleType === "stacked_imbalance");
    const trapped = breakdown.find((entry) => entry.ruleType === "trapped_traders");

    expect(stacked?.summary.resolvedCount).toBe(2);
    expect(stacked?.summary.totalRMultiple).toBe(0);
    expect(trapped?.summary.resolvedCount).toBe(1);
    expect(trapped?.summary.totalRMultiple).toBe(2);
  });

  it("returns only rule types actually present in the given items", () => {
    const breakdown = summarizeTrackRecordByRuleType([
      buildAlert({ id: "a", ruleType: "stacked_imbalance" }),
    ]);

    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].ruleType).toBe("stacked_imbalance");
  });
});
