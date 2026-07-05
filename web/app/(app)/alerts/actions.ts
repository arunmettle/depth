"use server";

import { revalidatePath } from "next/cache";

import { type AlertRuleFormState } from "@/lib/alerts/form-state";
import {
  deleteAlertRuleForCurrentUser,
  upsertAlertRuleForCurrentUser,
} from "@/lib/alerts/rules";
import {
  supportedMarkets,
  supportedRuleTypes,
  supportedStatuses,
  supportedTimeframes,
  type SupportedMarket,
  type SupportedRuleType,
  type SupportedStatus,
  type SupportedTimeframe,
} from "@/lib/alerts/schema";
import {
  validateAlertRuleName,
  validateStackedImbalanceParams,
  validateTrappedTradersParams,
} from "@/lib/alerts/validation";

function isSupportedValue<T extends readonly string[]>(
  allowedValues: T,
  value: string
): value is T[number] {
  return (allowedValues as readonly string[]).includes(value);
}

export async function saveAlertRule(
  _previousState: AlertRuleFormState,
  formData: FormData
): Promise<AlertRuleFormState> {
  const id = String(formData.get("id") ?? "").trim() || undefined;
  const nameResult = validateAlertRuleName(String(formData.get("name") ?? ""));
  const marketSymbol = String(formData.get("marketSymbol") ?? "").trim();
  const timeframe = String(formData.get("timeframe") ?? "").trim();
  const ruleType = String(formData.get("ruleType") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!nameResult.ok) {
    return {
      message: nameResult.message,
      status: "error",
    };
  }

  if (!isSupportedValue(supportedMarkets, marketSymbol)) {
    return {
      message: "Choose one of the supported launch markets.",
      status: "error",
    };
  }

  if (!isSupportedValue(supportedTimeframes, timeframe)) {
    return {
      message: "Choose one of the supported launch timeframes.",
      status: "error",
    };
  }

  if (!isSupportedValue(supportedRuleTypes, ruleType)) {
    return {
      message: "Choose one of the supported v1 rule types.",
      status: "error",
    };
  }

  if (!isSupportedValue(supportedStatuses, status)) {
    return {
      message: "Choose an allowed rule status.",
      status: "error",
    };
  }

  let params;

  if (ruleType === "stacked_imbalance") {
    const result = validateStackedImbalanceParams(formData);

    if (!result.ok) {
      return {
        message: result.message,
        status: "error",
      };
    }

    params = result.data;
  } else {
    const result = validateTrappedTradersParams(formData);

    if (!result.ok) {
      return {
        message: result.message,
        status: "error",
      };
    }

    params = result.data;
  }

  try {
    await upsertAlertRuleForCurrentUser({
      id,
      marketSymbol: marketSymbol as SupportedMarket,
      name: nameResult.data,
      params,
      ruleType: ruleType as SupportedRuleType,
      status: status as SupportedStatus,
      timeframe: timeframe as SupportedTimeframe,
    });
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? error.message
          : "Sentinel Flow could not save that alert rule.",
      status: "error",
    };
  }

  revalidatePath("/alerts");
  revalidatePath("/dashboard");

  return {
    message: id ? "Alert rule updated." : "Alert rule created.",
    status: "success",
  };
}

export async function deleteAlertRule(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    return;
  }

  await deleteAlertRuleForCurrentUser(id);
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}
