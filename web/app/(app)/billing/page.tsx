import { startCheckout, openBillingPortal } from "@/app/(app)/billing/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getBillingConfig } from "@/lib/billing/config";
import {
  billingPlanKeys,
  billingPlans,
  describeActiveRuleLimit,
  hasPaidBillingAccess,
} from "@/lib/billing/plans";
import {
  canPersistBillingAccount,
  getBillingAccountForCurrentUser,
} from "@/lib/billing/subscriptions";

function getStatusCopy(searchParams: {
  checkout?: string;
  error?: string;
}) {
  if (searchParams.checkout === "success") {
    return "Checkout completed. Stripe will confirm the subscription and refresh access shortly.";
  }

  if (searchParams.checkout === "canceled") {
    return "Checkout was canceled before the subscription started.";
  }

  if (searchParams.error === "missing-customer") {
    return "No Stripe customer exists for this account yet. Start a plan first.";
  }

  if (searchParams.error === "invalid-plan") {
    return "That billing plan is not available for checkout.";
  }

  return null;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; error?: string }>;
}) {
  const params = await searchParams;
  const config = getBillingConfig();
  const billingAccount = await getBillingAccountForCurrentUser();
  const planCards = billingPlanKeys.map((planKey) => ({
    key: planKey,
    plan: billingPlans[planKey],
    priceId: config.priceIds[planKey] ?? null,
  }));
  const statusCopy = getStatusCopy(params);
  const canManageBilling = Boolean(billingAccount?.stripeCustomerId);
  const hasPaidAccess = hasPaidBillingAccess(billingAccount?.status);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Billing and access control</CardTitle>
          <CardDescription>
            Monetization stays intentionally simple at launch: clear pricing,
            self-serve checkout, and backend-enforced plan limits.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {statusCopy ? (
            <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
              {statusCopy}
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {planCards.map(({ key, plan, priceId }) => (
            <div
              key={plan.name}
              className="flex flex-col gap-3 rounded-xl border border-border bg-background p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-medium">{plan.name}</h2>
                <Badge variant="outline">{plan.priceLabel}</Badge>
              </div>
              {plan.launchBadge ? (
                <Badge variant="secondary" className="w-fit">
                  {plan.launchBadge}
                </Badge>
              ) : null}
              <p className="text-sm leading-6 text-muted-foreground">
                {plan.description}
              </p>
              <p className="text-sm text-muted-foreground">
                {describeActiveRuleLimit(plan.activeRuleLimit, "active")}
              </p>
              {priceId ? (
                <form action={startCheckout} className="mt-auto">
                  <input type="hidden" name="planKey" value={key} />
                  <Button type="submit" className="w-full">
                    {plan.ctaLabel}
                  </Button>
                </form>
              ) : (
                <div className="mt-auto rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                  {key === "alpha_stream"
                    ? "Handled as a direct launch conversation for now."
                    : "Add the Stripe price ID to make this plan purchasable."}
                </div>
              )}
            </div>
          ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current account state</CardTitle>
          <CardDescription>
            Traders should always know whether their alerts are truly live or still gated.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={hasPaidAccess ? "default" : "secondary"}>
                {hasPaidAccess ? "Paid access active" : "Access gated"}
              </Badge>
              <Badge variant="outline">
                {billingAccount?.plan?.name ?? "No active plan"}
              </Badge>
              <Badge variant="outline">
                {billingAccount?.status ?? "inactive"}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
              <p>
                {billingAccount?.plan
                  ? describeActiveRuleLimit(
                      billingAccount.plan.activeRuleLimit,
                      billingAccount.status
                    )
                  : "No active rules can be switched on until the account has a paid subscription."}
              </p>
              <p>
                {billingAccount?.trialEndsAt
                  ? `Trial ends at ${billingAccount.trialEndsAt}.`
                  : billingAccount?.currentPeriodEnd
                    ? `Current period ends at ${billingAccount.currentPeriodEnd}.`
                    : "Start with Checkout, then manage changes from the Stripe customer portal."}
              </p>
              {billingAccount?.cancelAtPeriodEnd ? (
                <p>
                  This subscription is set to cancel at period end unless it is resumed in the customer portal.
                </p>
              ) : null}
            </div>
            {canManageBilling ? (
              <form action={openBillingPortal} className="mt-4">
                <Button type="submit" variant="outline">
                  Manage subscription
                </Button>
              </form>
            ) : null}
          </div>

          <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Launch guardrails</p>
            <div className="mt-3 flex flex-col gap-2">
              <p>
                Checkout uses Stripe Billing rather than custom renewal logic, which keeps retries, invoice recovery, and subscription changes dependable.
              </p>
              <p>
                Subscription state is mirrored into Supabase so the web app can enforce access without waiting on live Stripe calls during normal product use.
              </p>
              <p>
                {canPersistBillingAccount()
                  ? "Billing persistence is ready once Stripe credentials are added."
                  : "Add a Supabase service-role key so Stripe webhooks can persist billing state."}
              </p>
              <p>
                {Object.values(config.priceIds).some(Boolean)
                  ? "At least one checkout plan is configured."
                  : "No Stripe price IDs are configured yet, so checkout remains intentionally disabled."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
