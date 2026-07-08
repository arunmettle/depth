import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  findHistoryRecord,
  getHistoryRecordById,
  getHistorySource,
  mapEngineHistoryPayload,
} from "@/lib/history/source";

vi.mock("@/lib/history/records", () => ({
  getPersistedAlertHistoryForCurrentUser: vi.fn(),
  getPersistedAlertHistoryRecordForCurrentUser: vi.fn(),
}));

import {
  getPersistedAlertHistoryForCurrentUser,
  getPersistedAlertHistoryRecordForCurrentUser,
} from "@/lib/history/records";

describe("history source", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("maps engine recent alerts into alert records", () => {
    const items = mapEngineHistoryPayload({
      stream: {
        evaluator: {
          recentAlerts: [
            {
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
              ruleType: "stacked_imbalance",
              side: "buy",
              timeframe: "1m",
            },
          ],
        },
      },
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("record-1");
    expect(items[0]?.proof.contentHash).toBe("hash-123");
  });

  it("returns an empty list when the engine payload has no recent alerts", () => {
    expect(mapEngineHistoryPayload({})).toEqual([]);
  });

  it("finds a history record by id", () => {
    const items = mapEngineHistoryPayload({
      stream: {
        evaluator: {
          recentAlerts: [
            {
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
              ruleType: "stacked_imbalance",
              side: "buy",
              timeframe: "1m",
            },
          ],
        },
      },
    });

    expect(findHistoryRecord(items, "record-1")?.id).toBe("record-1");
    expect(findHistoryRecord(items, "missing")).toBeNull();
  });

  it("prefers persisted alert history when available", async () => {
    vi.mocked(getPersistedAlertHistoryForCurrentUser).mockResolvedValue([
      {
        createdAt: "2026-07-05T06:02:00Z",
        deliveryStatus: "delivered",
        id: "alert-1",
        marketSymbol: "BTCUSDT",
        message: "Persisted alert",
        proof: {
          content: "<svg></svg>",
          contentHash: "hash-1",
          height: 960,
          mediaType: "image/svg+xml",
          width: 720,
        },
        ruleName: "BTC 1m stacked imbalance",
        ruleType: "stacked_imbalance",
        side: "buy",
        timeframe: "1m",
      },
    ]);

    const history = await getHistorySource();

    expect(history.source).toBe("supabase");
    expect(history.items[0]?.id).toBe("alert-1");
  });

  it("falls back to engine history when persisted history is unavailable", async () => {
    vi.mocked(getPersistedAlertHistoryForCurrentUser).mockResolvedValue(null);
    vi.stubEnv("ENGINE_STATUS_URL", "https://engine.test/healthz");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          stream: {
            evaluator: {
              recentAlerts: [
                {
                  createdAt: "2026-07-05T06:02:00Z",
                  deliveryStatus: "delivered",
                  id: "engine-1",
                  marketSymbol: "BTCUSDT",
                  message: "Engine alert",
                  proof: {
                    content: "<svg></svg>",
                    contentHash: "engine-hash",
                    height: 960,
                    mediaType: "image/svg+xml",
                    width: 720,
                  },
                  ruleName: "BTC 1m stacked imbalance",
                  ruleType: "stacked_imbalance",
                  side: "buy",
                  timeframe: "1m",
                },
              ],
            },
          },
        }),
      })
    );

    const history = await getHistorySource();

    expect(history.source).toBe("engine");
    expect(history.items[0]?.id).toBe("engine-1");
  });

  it("gets a persisted history record by id when the store is available", async () => {
    vi.mocked(getPersistedAlertHistoryRecordForCurrentUser).mockResolvedValue({
      available: true,
      item: {
        createdAt: "2026-07-05T06:02:00Z",
        deliveryStatus: "delivered",
        id: "alert-2",
        marketSymbol: "BTCUSDT",
        message: "Persisted alert detail",
        proof: {
          content: "<svg></svg>",
          contentHash: "hash-2",
          height: 960,
          mediaType: "image/svg+xml",
          width: 720,
        },
        ruleName: "BTC 1m stacked imbalance",
        ruleType: "stacked_imbalance",
        side: "buy",
        timeframe: "1m",
      },
    });

    const result = await getHistoryRecordById("alert-2");

    expect(result.source).toBe("supabase");
    expect(result.item?.id).toBe("alert-2");
  });
});
