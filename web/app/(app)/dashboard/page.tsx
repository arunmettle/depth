import Link from "next/link";
import {
  ArrowRightIcon,
  BotIcon,
  ShieldCheckIcon,
  ZapIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { describeAlertRule } from "@/lib/alerts/presentation";
import { getAlertRulesForCurrentUser } from "@/lib/alerts/rules";
import { getBillingAccountForCurrentUser } from "@/lib/billing/subscriptions";
import { buttonVariants } from "@/components/ui/button";
import { getEngineRuntimeSummary } from "@/lib/engine-status/source";
import { getLaunchReadiness } from "@/lib/launch-readiness";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthState } from "@/lib/supabase/server";
import {
  canPersistTelegramConnection,
  getTelegramConnectionForCurrentUser,
} from "@/lib/telegram/connections";
import { getTelegramConfig } from "@/lib/telegram/config";
import { getTelegramPairingReadiness } from "@/lib/telegram/readiness";
import { cn } from "@/lib/utils";

const signalCards = [
  {
    description: "Bybit BTCUSDT and ETHUSDT with strict v1 scope control.",
    icon: ZapIcon,
    title: "Market scope",
  },
  {
    description: "Telegram-first delivery with proof snapshots and history review.",
    icon: BotIcon,
    title: "Delivery model",
  },
  {
    description:
      "Reliability-first rollout with narrow alerts and clear validation gates.",
    icon: ShieldCheckIcon,
    title: "Trust model",
  },
];

export default async function DashboardPage() {
  const auth = await getAuthState();
  const engine = await getEngineRuntimeSummary();
  const rules = await getAlertRulesForCurrentUser();
  const billingAccount = await getBillingAccountForCurrentUser();
  const telegramConnection = auth.isAuthenticated
    ? await getTelegramConnectionForCurrentUser()
    : null;
  const telegramReadiness = getTelegramPairingReadiness({
    auth,
    canPersistConnection: canPersistTelegramConnection(),
    config: getTelegramConfig(),
  });
  const launchReadiness = getLaunchReadiness({
    auth,
    billingAccount,
    engine,
    rules,
    telegramConnection,
    telegramReadiness,
  });
  const activeRuleCount = rules.filter((rule) => rule.status === "active").length;

  const engineBadge =
    engine?.deliveryStatus === "configured"
      ? "Live visibility"
      : engine?.deliveryStatus === "degraded"
        ? "Needs attention"
        : engine?.deliveryStatus === "idle"
          ? "Connected path"
          : "Not connected";

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>Production-first shell for Sentinel Flow</CardTitle>
            <CardDescription>
              This dashboard is the stable landing surface for auth, alert
              setup, Telegram connection, and future proof history without
              introducing platform clutter.
            </CardDescription>
            <CardAction>
              <Badge variant="secondary">Goal 8 active</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {signalCards.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.title}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-background ring-1 ring-border">
                    <Icon />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h2 className="font-medium">{item.title}</h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
          <CardFooter className="justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Keep the build narrow, testable, and visually consistent from the
              first release.
            </p>
            <Link
              href="/alerts"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Configure rules
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Runtime readiness</CardTitle>
            <CardDescription>
              Production trust improves when delivery health is visible without
              needing raw engine logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 rounded-xl border border-border bg-background p-4">
              <span className="text-sm font-medium">Auth</span>
              <span className="text-sm text-muted-foreground">
                {auth.isConfigured
                  ? auth.isAuthenticated
                    ? `Signed in as ${auth.email ?? "active user"}.`
                    : "Supabase is configured and waiting for a session."
                  : "Supabase project credentials still need to be added."}
              </span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Engine delivery</span>
                <Badge
                  variant={
                    engine?.deliveryStatus === "configured"
                      ? "default"
                      : engine?.deliveryStatus === "degraded"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {engineBadge}
                </Badge>
              </div>
              <span className="text-sm text-muted-foreground">
                {engine
                  ? engine.deliveryStatus === "degraded"
                    ? "Delivery or persistence has reported an error. Use the Goal 8 validation flow and engine status to inspect the latest failure."
                    : engine.deliveryStatus === "configured"
                      ? `Dispatches ${engine.dispatchAttempts}, deliveries ${engine.deliveredAlerts}, persisted writes ${engine.persistedWrites}.`
                      : `Engine status is reachable. Rule source ${engine.ruleSource ?? "unknown"} with ${engine.recentAlertCount} recent alert records so far.`
                  : "Add ENGINE_STATUS_URL to let the dashboard surface live engine delivery visibility."}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-background p-4">
                <span className="text-xs font-medium text-muted-foreground">
                  Dispatch attempts
                </span>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {engine?.dispatchAttempts ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <span className="text-xs font-medium text-muted-foreground">
                  Delivered alerts
                </span>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {engine?.deliveredAlerts ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <span className="text-xs font-medium text-muted-foreground">
                  Retry attempts
                </span>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {engine?.retryAttempts ?? "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
        <Card>
          <CardHeader>
            <CardTitle>Rule readiness</CardTitle>
            <CardDescription>
              The alert rule layer is now the bridge between product configuration and the future engine.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-background p-4">
              <span className="text-sm font-medium">Active rules</span>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {activeRuleCount}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {rules.length
                  ? "Configured launch-scope rules ready to attach to the live evaluator."
                  : "No saved rules yet. Create your first guided rule from the Alerts page."}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recently saved rules</CardTitle>
            <CardDescription>
              We surface the latest launch-scope rules here so the dashboard stays operational, not decorative.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {rules.slice(0, 3).map((rule) => (
              <div
                key={rule.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{rule.name}</span>
                  <Badge variant={rule.status === "active" ? "default" : "secondary"}>
                    {rule.status}
                  </Badge>
                  <Badge variant="outline">{rule.marketSymbol}</Badge>
                  <Badge variant="outline">{rule.timeframe}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {describeAlertRule(rule)}
                </p>
              </div>
            ))}
            {!rules.length ? (
              <p className="text-sm text-muted-foreground">
                No rules have been saved yet. The dashboard will show them here once they are configured.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Launch readiness</CardTitle>
            <CardDescription>
              One production checklist keeps Founding Access decisions grounded in actual system state.
            </CardDescription>
            <CardAction>
              <Badge variant={launchReadiness.complete ? "default" : "secondary"}>
                {launchReadiness.complete ? "Launch-ready" : "Needs signoff"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3">
            {launchReadiness.items.map((item) => (
              <div
                key={item.label}
                className="flex flex-col gap-2 rounded-xl border border-border bg-background px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.detail}</p>
                </div>
                <Badge variant={item.ready ? "outline" : "secondary"}>
                  {item.ready ? "Ready" : "Blocked"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Founding Access posture</CardTitle>
            <CardDescription>
              Launch stays disciplined when onboarding, monetization, and reliability all point in the same direction.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>
              The public launch bar is intentionally higher than local build success: auth, Telegram, billing, rules, and engine visibility all need to be live together.
            </p>
            <p>
              Billing gating now prevents unpaid accounts from activating live rules, which keeps early-user promises aligned with actual entitlement.
            </p>
            <p>
              This dashboard checklist is the operator-friendly proof surface for Goal 10 before wider marketing or onboarding claims are made.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
