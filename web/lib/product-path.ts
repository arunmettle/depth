import type { AlertRule } from "@/lib/alerts/schema";
import type { EngineRuntimeSummary } from "@/lib/engine-status/schema";
import type { TelegramConnection } from "@/lib/telegram/connections";

export type ProductPathItem = {
  detail: string;
  label: string;
  ready: boolean;
};

export type ProductPathAction = {
  detail: string;
  href: string;
  label: string;
};

export function getProductPathState(args: {
  engine: EngineRuntimeSummary | null;
  historyCount: number;
  rules: AlertRule[];
  telegramConnection: TelegramConnection | null;
}) {
  const activeRuleCount = args.rules.filter((rule) => rule.status === "active").length;
  const savedRuleCount = args.rules.length;
  const hasTelegramConnection = Boolean(args.telegramConnection);
  const engineConnected = Boolean(args.engine?.connected);
  const hasHistory = args.historyCount > 0;

  const items: ProductPathItem[] = [
    {
      detail: hasTelegramConnection
        ? `Connected to chat ${args.telegramConnection?.telegramChatId}.`
        : "Pair one Telegram destination before expecting live alert delivery.",
      label: "Telegram destination",
      ready: hasTelegramConnection,
    },
    {
      detail:
        activeRuleCount > 0
          ? `${activeRuleCount} active rule${activeRuleCount === 1 ? "" : "s"} currently feeding the live path.`
          : savedRuleCount > 0
            ? `${savedRuleCount} saved rule${savedRuleCount === 1 ? "" : "s"} exist, but none are active yet.`
            : "Save your first narrow launch-scope rule to start the alert path.",
      label: "Live rules",
      ready: activeRuleCount > 0,
    },
    {
      detail: engineConnected
        ? `Engine visibility is live through ${args.engine?.ruleSource ?? "the current rule source"}.`
        : "Engine visibility is not connected in the app yet.",
      label: "Engine visibility",
      ready: engineConnected,
    },
    {
      detail: hasHistory
        ? `${args.historyCount} proof-backed alert${args.historyCount === 1 ? "" : "s"} available for review.`
        : "No proof history yet. The first delivered alert will appear here for review.",
      label: "Proof review",
      ready: hasHistory,
    },
  ];

  let nextAction: ProductPathAction;

  if (!hasTelegramConnection) {
    nextAction = {
      detail: "Connect the Telegram bot first so the engine has a real destination for alerts.",
      href: "/settings",
      label: "Connect Telegram",
    };
  } else if (activeRuleCount === 0) {
    nextAction = {
      detail: "Create one focused launch-scope rule and keep it easy to interpret.",
      href: "/alerts",
      label: "Create first rule",
    };
  } else if (!engineConnected) {
    nextAction = {
      detail: "Check runtime visibility before trusting live sends or onboarding more users.",
      href: "/dashboard",
      label: "Review engine status",
    };
  } else if (!hasHistory) {
    nextAction = {
      detail: "The engine path is live. The next triggered alert should land in proof history.",
      href: "/history",
      label: "Watch proof history",
    };
  } else {
    nextAction = {
      detail: "Review the latest proof-backed alerts and keep the signal loop grounded in evidence.",
      href: "/history",
      label: "Review recent alerts",
    };
  }

  return {
    activeRuleCount,
    complete: items.every((item) => item.ready),
    items,
    nextAction,
  };
}
