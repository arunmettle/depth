import type { AlertRule } from "@/lib/alerts/schema";
import { hasPaidBillingAccess, type BillingSubscriptionStatus } from "@/lib/billing/plans";
import type { BillingAccount } from "@/lib/billing/subscriptions";
import type { EngineRuntimeSummary } from "@/lib/engine-status/schema";
import type { AuthState } from "@/lib/supabase/server";
import type { TelegramConnection } from "@/lib/telegram/connections";
import type { TelegramPairingReadinessItem } from "@/lib/telegram/readiness";

export type LaunchReadinessItem = {
  detail: string;
  label: string;
  ready: boolean;
};

export function getLaunchReadiness(args: {
  auth: AuthState;
  billingAccount: BillingAccount | null;
  engine: EngineRuntimeSummary | null;
  rules: AlertRule[];
  telegramConnection: TelegramConnection | null;
  telegramReadiness: {
    complete: boolean;
    items: TelegramPairingReadinessItem[];
  };
}) {
  const activeRuleCount = args.rules.filter((rule) => rule.status === "active").length;
  const billingStatus: BillingSubscriptionStatus =
    args.billingAccount?.status ?? "inactive";
  const hasPaidAccess = hasPaidBillingAccess(billingStatus);
  const engineReady = Boolean(
    args.engine?.connected &&
      args.engine.deliveryStatus !== "degraded" &&
      args.engine.deliveryStatus !== "unavailable"
  );

  const items: LaunchReadinessItem[] = [
    {
      detail: args.auth.isConfigured
        ? args.auth.isAuthenticated
          ? `Signed in as ${args.auth.email ?? "an active operator"}.`
          : "Supabase auth is configured, but a real operator session still needs sign-in."
        : "Add the Supabase URL and publishable key before exposing the app publicly.",
      label: "Operator session",
      ready: args.auth.isConfigured && args.auth.isAuthenticated,
    },
    {
      detail: args.telegramReadiness.complete
        ? args.telegramConnection
          ? `Telegram is configured and paired to chat ${args.telegramConnection.telegramChatId}.`
          : "Telegram infrastructure is ready, but a real destination chat still needs to be paired."
        : `Telegram setup is incomplete: ${
            args.telegramReadiness.items.find((item) => !item.ready)?.label.toLowerCase() ??
            "configuration"
          } still needs attention.`,
      label: "Telegram delivery path",
      ready: args.telegramReadiness.complete && Boolean(args.telegramConnection),
    },
    {
      detail: hasPaidAccess
        ? `${args.billingAccount?.plan?.name ?? "Paid plan"} is live with subscription status ${billingStatus}.`
        : "A paid billing plan is required before live alert rules can be trusted for launch users.",
      label: "Paid billing access",
      ready: hasPaidAccess,
    },
    {
      detail:
        activeRuleCount > 0
          ? `${activeRuleCount} active launch-scope rule${
              activeRuleCount === 1 ? "" : "s"
            } currently configured.`
          : "Activate at least one launch-scope alert rule before public release.",
      label: "Live alert rules",
      ready: activeRuleCount > 0,
    },
    {
      detail: engineReady
        ? `Engine is connected with ${args.engine?.deliveryStatus ?? "unknown"} delivery visibility.`
        : args.engine?.deliveryStatus === "degraded"
          ? "Engine reported a delivery or persistence error. Fix that before launch."
          : "Add ENGINE_STATUS_URL and confirm the live engine is connected before public release.",
      label: "Engine visibility",
      ready: engineReady,
    },
  ];

  return {
    complete: items.every((item) => item.ready),
    items,
  };
}
