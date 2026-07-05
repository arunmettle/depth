import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/alerts/rules", () => ({
  deleteAlertRuleForCurrentUser: vi.fn(),
  upsertAlertRuleForCurrentUser: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import {
  deleteAlertRuleForCurrentUser,
  upsertAlertRuleForCurrentUser,
} from "@/lib/alerts/rules";

import { deleteAlertRule, saveAlertRule } from "./actions";

function buildBaseFormData() {
  const formData = new FormData();
  formData.set("name", "BTC 5m stacked follow-through");
  formData.set("marketSymbol", "BTCUSDT");
  formData.set("timeframe", "5m");
  formData.set("ruleType", "stacked_imbalance");
  formData.set("status", "active");
  formData.set("thresholdMultiplier", "300");
  formData.set("confirmationRows", "3");
  formData.set("minAbsorptionVolume", "250000");
  formData.set("trapSide", "both");
  return formData;
}

describe("alert rule actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a validation error for an invalid rule name", async () => {
    const formData = buildBaseFormData();
    formData.set("name", "ab");

    const result = await saveAlertRule(
      { message: null, status: "idle" },
      formData
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("at least 3 characters");
    expect(upsertAlertRuleForCurrentUser).not.toHaveBeenCalled();
  });

  it("saves a stacked imbalance rule and revalidates affected pages", async () => {
    const formData = buildBaseFormData();

    const result = await saveAlertRule(
      { message: null, status: "idle" },
      formData
    );

    expect(result).toEqual({
      message: "Alert rule created.",
      status: "success",
    });
    expect(upsertAlertRuleForCurrentUser).toHaveBeenCalledWith({
      id: undefined,
      marketSymbol: "BTCUSDT",
      name: "BTC 5m stacked follow-through",
      params: {
        confirmationRows: 3,
        thresholdMultiplier: 300,
      },
      ruleType: "stacked_imbalance",
      status: "active",
      timeframe: "5m",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/alerts");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("saves a trapped traders rule update", async () => {
    const formData = buildBaseFormData();
    formData.set("id", "rule-123");
    formData.set("ruleType", "trapped_traders");
    formData.set("minAbsorptionVolume", "500000");
    formData.set("trapSide", "buyers");

    const result = await saveAlertRule(
      { message: null, status: "idle" },
      formData
    );

    expect(result).toEqual({
      message: "Alert rule updated.",
      status: "success",
    });
    expect(upsertAlertRuleForCurrentUser).toHaveBeenCalledWith({
      id: "rule-123",
      marketSymbol: "BTCUSDT",
      name: "BTC 5m stacked follow-through",
      params: {
        minAbsorptionVolume: 500000,
        trapSide: "buyers",
      },
      ruleType: "trapped_traders",
      status: "active",
      timeframe: "5m",
    });
  });

  it("surfaces persistence errors from save", async () => {
    vi.mocked(upsertAlertRuleForCurrentUser).mockRejectedValue(
      new Error("database offline")
    );
    const formData = buildBaseFormData();

    const result = await saveAlertRule(
      { message: null, status: "idle" },
      formData
    );

    expect(result).toEqual({
      message: "database offline",
      status: "error",
    });
  });

  it("deletes a rule and revalidates affected pages", async () => {
    const formData = new FormData();
    formData.set("id", "rule-456");

    await deleteAlertRule(formData);

    expect(deleteAlertRuleForCurrentUser).toHaveBeenCalledWith("rule-456");
    expect(revalidatePath).toHaveBeenCalledWith("/alerts");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });
});
