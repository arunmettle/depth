import { describe, expect, it } from "vitest";

import {
  isPostFixAlert,
  MINIMUM_TRUSTWORTHY_SAMPLE_SIZE,
  partitionByFixTimeline,
  STOP_FLOOR_FIX_DEPLOYED_AT,
} from "@/lib/history/fix-timeline";
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

describe("isPostFixAlert", () => {
  it("returns false for alerts created before the stop-floor fix deployed", () => {
    const alert = buildAlert({ createdAt: "2026-07-01T00:00:00Z" });

    expect(isPostFixAlert(alert)).toBe(false);
  });

  it("returns true for alerts created at or after the fix deploy timestamp", () => {
    const alert = buildAlert({ createdAt: STOP_FLOOR_FIX_DEPLOYED_AT });

    expect(isPostFixAlert(alert)).toBe(true);
  });

  it("returns true for alerts created well after the fix deployed", () => {
    const alert = buildAlert({ createdAt: "2026-08-01T00:00:00Z" });

    expect(isPostFixAlert(alert)).toBe(true);
  });
});

describe("partitionByFixTimeline", () => {
  it("splits items into pre-fix and post-fix buckets", () => {
    const preFixAlert = buildAlert({ createdAt: "2026-07-01T00:00:00Z", id: "pre" });
    const postFixAlert = buildAlert({ createdAt: "2026-08-01T00:00:00Z", id: "post" });

    const result = partitionByFixTimeline([preFixAlert, postFixAlert]);

    expect(result.preFix).toEqual([preFixAlert]);
    expect(result.postFix).toEqual([postFixAlert]);
  });

  it("returns an empty post-fix bucket when all items predate the fix", () => {
    const preFixAlert = buildAlert({ createdAt: "2026-07-01T00:00:00Z" });

    const result = partitionByFixTimeline([preFixAlert]);

    expect(result.preFix).toHaveLength(1);
    expect(result.postFix).toHaveLength(0);
  });
});

describe("MINIMUM_TRUSTWORTHY_SAMPLE_SIZE", () => {
  it("is a positive integer", () => {
    expect(MINIMUM_TRUSTWORTHY_SAMPLE_SIZE).toBeGreaterThan(0);
    expect(Number.isInteger(MINIMUM_TRUSTWORTHY_SAMPLE_SIZE)).toBe(true);
  });
});
