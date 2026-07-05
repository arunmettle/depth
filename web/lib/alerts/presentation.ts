import type { AlertRule } from "@/lib/alerts/schema";

export function describeAlertRule(rule: AlertRule) {
  if (rule.ruleType === "stacked_imbalance") {
    const params = rule.params as {
      confirmationRows: number;
      thresholdMultiplier: number;
    };

    return `Stacked imbalance at ${params.thresholdMultiplier}% across ${params.confirmationRows} rows`;
  }

  const params = rule.params as {
    minAbsorptionVolume: number;
    trapSide: "both" | "buyers" | "sellers";
  };

  return `Trapped traders on ${params.trapSide} with min absorption ${params.minAbsorptionVolume}`;
}
