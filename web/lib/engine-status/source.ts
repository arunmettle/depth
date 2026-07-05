import type {
  EngineRuntimeSummary,
  EngineStatusPayload,
} from "@/lib/engine-status/schema";

function getEngineStatusURL() {
  return process.env.ENGINE_STATUS_URL?.trim() || null;
}

export function summarizeEngineStatus(
  payload: EngineStatusPayload
): EngineRuntimeSummary {
  const stream = payload.stream;
  const delivery = stream?.delivery;
  const recentAlertCount = stream?.evaluator?.recentAlerts?.length ?? 0;
  const lastDeliveryStatus = delivery?.lastDeliveryStatus ?? null;

  let deliveryStatus: EngineRuntimeSummary["deliveryStatus"] = "idle";
  if (!stream) {
    deliveryStatus = "unavailable";
  } else if (delivery?.lastDeliveryErr || delivery?.lastPersistErr) {
    deliveryStatus = "degraded";
  } else if ((delivery?.dispatchAttempts ?? 0) > 0 || recentAlertCount > 0) {
    deliveryStatus = "configured";
  }

  return {
    connected: Boolean(stream?.connected),
    deliveryStatus,
    dispatchAttempts: delivery?.dispatchAttempts ?? 0,
    deliveredAlerts: delivery?.deliveredAlerts ?? 0,
    lastDeliveryStatus,
    persistedWrites: delivery?.persistedWrites ?? 0,
    recentAlertCount,
    retryAttempts: delivery?.retryAttempts ?? 0,
    ruleSource: stream?.evaluator?.ruleSource ?? null,
    source: stream ? "engine" : "unavailable",
  };
}

export async function getEngineRuntimeSummary(): Promise<EngineRuntimeSummary | null> {
  const url = getEngineStatusURL();
  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as EngineStatusPayload;
    return summarizeEngineStatus(payload);
  } catch {
    return null;
  }
}
