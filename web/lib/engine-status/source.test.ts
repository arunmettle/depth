import { describe, expect, it } from "vitest";

import { summarizeEngineStatus } from "@/lib/engine-status/source";

describe("engine status source", () => {
  it("summarizes configured engine delivery state", () => {
    const summary = summarizeEngineStatus({
      stream: {
        connected: true,
        delivery: {
          dispatchAttempts: 3,
          deliveredAlerts: 2,
          lastAlertId: "alert-1",
          lastDeliveryStatus: "delivered",
          persistedWrites: 4,
          retryAttempts: 1,
        },
        evaluator: {
          configuredRules: 2,
          recentAlerts: [{ id: "alert-1", deliveryStatus: "delivered" }],
          ruleSource: "supabase-alert-rules",
        },
      },
    });

    expect(summary.deliveryStatus).toBe("configured");
    expect(summary.deliveredAlerts).toBe(2);
    expect(summary.ruleSource).toBe("supabase-alert-rules");
  });

  it("marks the engine as degraded when delivery errors exist", () => {
    const summary = summarizeEngineStatus({
      stream: {
        connected: true,
        delivery: {
          dispatchAttempts: 1,
          deliveredAlerts: 0,
          lastDeliveryErr: "telegram failed",
          lastDeliveryStatus: "retrying",
          persistedWrites: 1,
          retryAttempts: 1,
        },
      },
    });

    expect(summary.deliveryStatus).toBe("degraded");
    expect(summary.lastDeliveryStatus).toBe("retrying");
  });

  it("falls back to idle when no delivery activity exists yet", () => {
    const summary = summarizeEngineStatus({
      stream: {
        connected: false,
        delivery: {
          dispatchAttempts: 0,
          deliveredAlerts: 0,
          persistedWrites: 0,
          retryAttempts: 0,
        },
      },
    });

    expect(summary.deliveryStatus).toBe("idle");
    expect(summary.dispatchAttempts).toBe(0);
  });
});
