import type { EngineRuntimeSummary } from "@/lib/engine-status/schema";

export function getEngineDeliveryLabel(
  status: EngineRuntimeSummary["deliveryStatus"] | null | undefined
) {
  switch (status) {
    case "configured":
      return "Delivery healthy";
    case "degraded":
      return "Delivery degraded";
    case "idle":
      return "Delivery idle";
    default:
      return "Engine unavailable";
  }
}

export function summarizeEngineDelivery(summary: EngineRuntimeSummary | null) {
  if (!summary) {
    return "Add ENGINE_STATUS_URL to surface live engine delivery health in the app.";
  }

  if (summary.deliveryStatus === "degraded") {
    return "Delivery or persistence reported an error. Review the latest engine health status before trusting new alert sends.";
  }

  if (summary.deliveryStatus === "configured") {
    return `Dispatches ${summary.dispatchAttempts}, deliveries ${summary.deliveredAlerts}, persisted writes ${summary.persistedWrites}.`;
  }

  return `Engine visibility is connected, but delivery activity is still quiet. Recent alerts ${summary.recentAlertCount}, rule source ${summary.ruleSource ?? "unknown"}.`;
}
