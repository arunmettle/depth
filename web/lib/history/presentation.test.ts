import { describe, expect, it } from "vitest";

import {
  getDeliveryLabel,
  getOutcomeBadgeLabel,
  getOutcomeBadgeVariant,
  getOutcomeDetail,
  getProofImageSrc,
  getSideLabel,
  getSignalRangeLabel,
  getTradePlanTiles,
  summarizeProof,
} from "@/lib/history/presentation";
import type { AlertOutcome, AlertRecord } from "@/lib/history/schema";

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
  ruleType: "stacked_imbalance",
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

  it("builds trade plan tiles for entry, stop, and targets", () => {
    expect(
      getTradePlanTiles({
        entryPrice: 64250.5,
        riskReward1: 1,
        riskReward2: 2,
        signalHigh: 64310,
        signalLow: 64180,
        stopLoss: 64120.25,
        takeProfit1: 64380.75,
        takeProfit2: 64511,
        triggerPrice: 64250.5,
      })
    ).toEqual([
      { label: "Entry", value: "64250.50" },
      { label: "Stop", value: "64120.25" },
      { label: "TP1", value: "64380.75" },
      { label: "TP2", value: "64511.00" },
    ]);
  });

  it("returns N/A trade plan tiles when no trade plan is present", () => {
    expect(getTradePlanTiles(undefined)).toEqual([
      { label: "Entry", value: "N/A" },
      { label: "Stop", value: "N/A" },
      { label: "TP1", value: "N/A" },
      { label: "TP2", value: "N/A" },
    ]);
  });

  it("summarizes the signal range from a trade plan", () => {
    expect(
      getSignalRangeLabel({
        entryPrice: 64250.5,
        riskReward1: 1,
        riskReward2: 2,
        signalHigh: 64310,
        signalLow: 64180,
        stopLoss: 64120.25,
        takeProfit1: 64380.75,
        takeProfit2: 64511,
        triggerPrice: 64250.5,
      })
    ).toBe("64180.00 to 64310.00");
    expect(getSignalRangeLabel(undefined)).toBe("N/A");
  });

  it("labels outcome badges for each real tracked status", () => {
    const tp1: AlertOutcome = { status: "tp1_hit", rMultiple: 1.5 };
    const tp2: AlertOutcome = { status: "tp2_hit", rMultiple: 2 };
    const stop: AlertOutcome = { status: "stop_hit", rMultiple: -1 };
    const expired: AlertOutcome = { status: "expired" };
    const pending: AlertOutcome = { status: "pending" };

    expect(getOutcomeBadgeLabel(tp1)).toBe("TP1 hit +1.50R");
    expect(getOutcomeBadgeLabel(tp2)).toBe("TP2 hit +2.00R");
    expect(getOutcomeBadgeLabel(stop)).toBe("Stopped out -1.00R");
    expect(getOutcomeBadgeLabel(expired)).toBe("No clear outcome");
    expect(getOutcomeBadgeLabel(pending)).toBe("Outcome: tracking");
    expect(getOutcomeBadgeLabel(undefined)).toBe("Outcome: tracking");
  });

  it("maps outcome statuses to badge variants", () => {
    expect(getOutcomeBadgeVariant({ status: "tp1_hit" })).toBe("default");
    expect(getOutcomeBadgeVariant({ status: "tp2_hit" })).toBe("default");
    expect(getOutcomeBadgeVariant({ status: "stop_hit" })).toBe("destructive");
    expect(getOutcomeBadgeVariant({ status: "expired" })).toBe("outline");
    expect(getOutcomeBadgeVariant({ status: "pending" })).toBe("secondary");
    expect(getOutcomeBadgeVariant(undefined)).toBe("secondary");
  });

  it("describes real tracked outcomes in detail text", () => {
    expect(getOutcomeDetail({ status: "tp1_hit", hitPrice: 64380.75 })).toContain(
      "64380.75"
    );
    expect(getOutcomeDetail({ status: "stop_hit", hitPrice: 64120.25 })).toContain(
      "stop-loss was actually reached"
    );
    expect(
      getOutcomeDetail({ status: "expired", note: "No level touched in 48h." })
    ).toBe("No level touched in 48h.");
    expect(getOutcomeDetail({ status: "pending" })).toContain("Still tracking");
    expect(getOutcomeDetail(undefined)).toContain("Still tracking");
  });
});
