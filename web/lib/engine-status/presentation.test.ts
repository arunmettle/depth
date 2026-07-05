import { describe, expect, it } from "vitest";

import {
  getEngineDeliveryLabel,
  summarizeEngineDelivery,
} from "@/lib/engine-status/presentation";

describe("engine status presentation", () => {
  it("labels delivery states for display", () => {
    expect(getEngineDeliveryLabel("configured")).toBe("Delivery healthy");
    expect(getEngineDeliveryLabel("degraded")).toBe("Delivery degraded");
    expect(getEngineDeliveryLabel("idle")).toBe("Delivery idle");
    expect(getEngineDeliveryLabel("unavailable")).toBe("Engine unavailable");
  });

  it("summarizes configured delivery activity", () => {
    expect(
      summarizeEngineDelivery({
        connected: true,
        deliveryStatus: "configured",
        dispatchAttempts: 4,
        deliveredAlerts: 3,
        lastDeliveryStatus: "delivered",
        persistedWrites: 5,
        recentAlertCount: 2,
        retryAttempts: 1,
        ruleSource: "supabase-alert-rules",
        source: "engine",
      })
    ).toContain("Dispatches 4, deliveries 3, persisted writes 5.");
  });

  it("summarizes degraded delivery activity", () => {
    expect(
      summarizeEngineDelivery({
        connected: true,
        deliveryStatus: "degraded",
        dispatchAttempts: 1,
        deliveredAlerts: 0,
        lastDeliveryStatus: "retrying",
        persistedWrites: 1,
        recentAlertCount: 1,
        retryAttempts: 1,
        ruleSource: "supabase-alert-rules",
        source: "engine",
      })
    ).toContain("reported an error");
  });
});
