import { describe, expect, it } from "vitest";

import {
  alertRuleValidationRanges,
  validateAlertRuleName,
  validateStackedImbalanceParams,
  validateTrappedTradersParams,
} from "@/lib/alerts/validation";

describe("alert rule validation", () => {
  it("accepts a valid alert name", () => {
    const result = validateAlertRuleName("BTC stacked follow-through");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe("BTC stacked follow-through");
    }
  });

  it("rejects an alert name that is too short", () => {
    const result = validateAlertRuleName("ab");

    expect(result.ok).toBe(false);
  });

  it("accepts valid stacked imbalance parameters", () => {
    const formData = new FormData();
    formData.set("thresholdMultiplier", "300");
    formData.set("confirmationRows", "3");

    const result = validateStackedImbalanceParams(formData);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.thresholdMultiplier).toBe(300);
      expect(result.data.confirmationRows).toBe(3);
    }
  });

  it("rejects out-of-range stacked imbalance parameters", () => {
    const formData = new FormData();
    formData.set(
      "thresholdMultiplier",
      String(alertRuleValidationRanges.stackedImbalanceThresholdMax + 1)
    );
    formData.set("confirmationRows", "1");

    const result = validateStackedImbalanceParams(formData);

    expect(result.ok).toBe(false);
  });

  it("accepts valid trapped traders parameters", () => {
    const formData = new FormData();
    formData.set("minAbsorptionVolume", "250000");
    formData.set("trapSide", "buyers");

    const result = validateTrappedTradersParams(formData);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.minAbsorptionVolume).toBe(250000);
      expect(result.data.trapSide).toBe("buyers");
    }
  });

  it("rejects trapped traders values outside the launch guardrails", () => {
    const formData = new FormData();
    formData.set(
      "minAbsorptionVolume",
      String(alertRuleValidationRanges.trappedTradersVolumeMin - 1)
    );
    formData.set("trapSide", "buyers");

    const result = validateTrappedTradersParams(formData);

    expect(result.ok).toBe(false);
  });
});
