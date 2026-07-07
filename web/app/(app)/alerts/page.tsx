import { AlertRuleForm } from "@/components/alert-rule-form";
import { AlertRuleList } from "@/components/alert-rule-list";
import { getAlertRuleReplayPreviews } from "@/lib/alerts/replay";
import { getAlertRuleForCurrentUser, getAlertRulesForCurrentUser } from "@/lib/alerts/rules";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { describeActiveRuleLimit } from "@/lib/billing/plans";
import { getBillingAccountForCurrentUser } from "@/lib/billing/subscriptions";
import { getEngineRuntimeSummary } from "@/lib/engine-status/source";
import { getHistorySource } from "@/lib/history/source";
import { getProductPathState } from "@/lib/product-path";
import { getAuthState } from "@/lib/supabase/server";
import { getTelegramConnectionForCurrentUser } from "@/lib/telegram/connections";
import { cn } from "@/lib/utils";

const alertRuleTypes = [
  {
    description:
      "Three-row buying or selling pressure with a constrained threshold model for the v1 release.",
    title: "Stacked Imbalance",
  },
  {
    description:
      "Absorption-focused reversal context for trapped buyers or trapped sellers within supported markets.",
    title: "Trapped Buyers / Sellers",
  },
];

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const params = await searchParams;
  const auth = await getAuthState();
  const rules = await getAlertRulesForCurrentUser();
  const replayPreviews = await getAlertRuleReplayPreviews(rules);
  const billingAccount = await getBillingAccountForCurrentUser();
  const engine = await getEngineRuntimeSummary();
  const history = await getHistorySource();
  const telegramConnection = auth.isAuthenticated
    ? await getTelegramConnectionForCurrentUser()
    : null;
  const productPath = getProductPathState({
    engine,
    historyCount: history.items.length,
    rules,
    telegramConnection,
  });
  const selectedRule = params.edit
    ? await getAlertRuleForCurrentUser(params.edit)
    : null;
  const editRuleMissing = Boolean(params.edit && !selectedRule);

  return (
    <div className="flex flex-col gap-6">
      {editRuleMissing ? (
        <Card>
          <CardHeader>
            <CardTitle>Rule unavailable</CardTitle>
            <CardDescription>
              That alert rule could not be loaded for this account. It may have
              been deleted or may not belong to the current user.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/alerts"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Back to new rule
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={productPath.complete ? "default" : "secondary"}>
              {productPath.complete ? "Live path ready" : "Build the live path"}
            </Badge>
            <Badge variant="outline">{productPath.activeRuleCount} active rules</Badge>
          </div>
          <CardTitle>Alert operating path</CardTitle>
          <CardDescription>
            Keep rule setup tied to the real product loop: Telegram destination,
            active rule, engine visibility, and proof review.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            {productPath.items.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-border bg-background px-4 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{item.label}</p>
                  <Badge variant={item.ready ? "outline" : "secondary"}>
                    {item.ready ? "Ready" : "Blocked"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-background px-4 py-4">
            <p className="text-sm font-medium">{productPath.nextAction.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {productPath.nextAction.detail}
            </p>
            <Link
              href={productPath.nextAction.href}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}
            >
              {productPath.nextAction.label}
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {selectedRule ? "Edit alert rule" : "Create alert rule"}
          </CardTitle>
          <CardDescription>
            Guided rule creation keeps Sentinel Flow narrow and explicit. We only expose the supported v1 rule surface so every saved alert stays explainable and testable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            {billingAccount?.plan
              ? `${billingAccount.plan.name}: ${describeActiveRuleLimit(
                  billingAccount.plan.activeRuleLimit,
                  billingAccount.status
                )}`
              : "Billing is required before live alert rules can be activated. You can still prepare drafts by saving them as paused."}
          </div>
          <AlertRuleForm
            key={selectedRule?.id ?? "new-rule"}
            selectedRule={selectedRule}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved rules</CardTitle>
          <CardDescription>
            These rules now include a recent replay preview so users can judge selectivity and short-horizon follow-through before trusting the live path.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertRuleList replayPreviews={replayPreviews} rules={rules} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Supported v1 rule types</CardTitle>
          <CardDescription>
            The product stays reliable by supporting a very small set of structurally clear patterns first.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {alertRuleTypes.map((rule) => (
            <div
              key={rule.title}
              className="flex flex-col gap-3 rounded-xl border border-border bg-background p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-medium">{rule.title}</h2>
                <Badge variant="outline">v1</Badge>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {rule.description}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
