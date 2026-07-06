export const billingPlanKeys = [
  "scout",
  "founding_access",
  "sentinel_pro",
  "alpha_stream",
] as const;

export type BillingPlanKey = (typeof billingPlanKeys)[number];

export const billingSubscriptionStatuses = [
  "active",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "inactive",
  "past_due",
  "paused",
  "trialing",
  "unpaid",
] as const;

export type BillingSubscriptionStatus =
  (typeof billingSubscriptionStatuses)[number];

export type BillingPlan = {
  activeRuleLimit: number | null;
  ctaLabel: string;
  description: string;
  launchBadge: string | null;
  name: string;
  priceLabel: string;
  rank: number;
};

export const billingPlans: Record<BillingPlanKey, BillingPlan> = {
  alpha_stream: {
    activeRuleLimit: null,
    ctaLabel: "Contact launch team",
    description:
      "Community broadcast rights, exports, and white-labeled delivery for premium alpha operators.",
    launchBadge: null,
    name: "Alpha Stream",
    priceLabel: "$149+/mo",
    rank: 4,
  },
  founding_access: {
    activeRuleLimit: null,
    ctaLabel: "Start Founding Access",
    description:
      "Launch pricing for traders who want full v1 access, proof history, and product-shaping feedback loops.",
    launchBadge: "Launch pricing",
    name: "Founding Access",
    priceLabel: "$39/mo",
    rank: 3,
  },
  scout: {
    activeRuleLimit: 2,
    ctaLabel: "Start Scout",
    description:
      "A narrow launch tier for focused traders who only need two active order-flow alerts at a time.",
    launchBadge: null,
    name: "Scout",
    priceLabel: "$29/mo",
    rank: 1,
  },
  sentinel_pro: {
    activeRuleLimit: null,
    ctaLabel: "Start Sentinel Pro",
    description:
      "Full launch access for serious traders who need more markets, deeper review, and no active-rule cap.",
    launchBadge: null,
    name: "Sentinel Pro",
    priceLabel: "$59/mo",
    rank: 2,
  },
};

export function isBillingPlanKey(value: string): value is BillingPlanKey {
  return billingPlanKeys.includes(value as BillingPlanKey);
}

export function isBillingSubscriptionStatus(
  value: string
): value is BillingSubscriptionStatus {
  return billingSubscriptionStatuses.includes(
    value as BillingSubscriptionStatus
  );
}

export function getBillingPlan(planKey: BillingPlanKey | null | undefined) {
  if (!planKey) {
    return null;
  }

  return billingPlans[planKey] ?? null;
}

export function hasPaidBillingAccess(
  status: BillingSubscriptionStatus | null | undefined
) {
  return status === "active" || status === "trialing";
}

export function getActiveRuleLimitForSubscription(args: {
  planKey: BillingPlanKey | null | undefined;
  status: BillingSubscriptionStatus | null | undefined;
}) {
  if (!hasPaidBillingAccess(args.status)) {
    return 0;
  }

  return getBillingPlan(args.planKey)?.activeRuleLimit ?? null;
}

export function describeActiveRuleLimit(
  limit: number | null,
  status: BillingSubscriptionStatus | null | undefined
) {
  if (!hasPaidBillingAccess(status)) {
    return "No active rules until a paid plan starts.";
  }

  if (limit === null) {
    return "Unlimited active rules on this tier.";
  }

  return `${limit} active rule${limit === 1 ? "" : "s"} on this tier.`;
}
