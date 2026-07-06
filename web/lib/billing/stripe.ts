import Stripe from "stripe";

import {
  getBillingAccountByCustomerId,
  updateBillingAccountByCustomerId,
  upsertBillingAccount,
} from "@/lib/billing/subscriptions";
import {
  getCheckoutPriceId,
  getPlanKeyForPriceId,
  requireBillingConfig,
} from "@/lib/billing/config";
import { getBillingPlan, type BillingPlanKey } from "@/lib/billing/plans";

const stripeApiVersion = "2026-06-24.dahlia";

let stripeClient: Stripe | null = null;

function getStripeClient() {
  if (stripeClient) {
    return stripeClient;
  }

  const config = requireBillingConfig();

  stripeClient = new Stripe(config.secretKey, {
    apiVersion: stripeApiVersion,
  });

  return stripeClient;
}

export async function createCheckoutSessionUrl(args: {
  email: string | null;
  existingCustomerId: string | null;
  planKey: BillingPlanKey;
  userId: string;
}) {
  const config = requireBillingConfig();
  const priceId = getCheckoutPriceId(args.planKey);

  if (!priceId) {
    throw new Error(
      `${getBillingPlan(args.planKey)?.name ?? "This plan"} is not configured for checkout yet.`
    );
  }

  const stripe = getStripeClient();
  let customerId = args.existingCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: args.email ?? undefined,
      metadata: {
        userId: args.userId,
      },
    });

    customerId = customer.id;

    await upsertBillingAccount({
      stripeCustomerId: customerId,
      userId: args.userId,
    });
  }

  const session = await stripe.checkout.sessions.create({
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    cancel_url: `${config.siteUrl}/billing?checkout=canceled`,
    client_reference_id: args.userId,
    customer: customerId,
    customer_update: {
      address: "auto",
      name: "auto",
    },
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata: {
      planKey: args.planKey,
      userId: args.userId,
    },
    mode: "subscription",
    subscription_data: {
      metadata: {
        planKey: args.planKey,
        userId: args.userId,
      },
      ...(config.trialDays ? { trial_period_days: config.trialDays } : {}),
    },
    success_url: `${config.siteUrl}/billing?checkout=success`,
  });

  if (!session.url) {
    throw new Error("Stripe checkout did not return a redirect URL.");
  }

  return session.url;
}

export async function createCustomerPortalUrl(customerId: string) {
  const config = requireBillingConfig();
  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${config.siteUrl}/billing`,
  });

  return session.url;
}

export function constructStripeWebhookEvent(payload: string, signature: string) {
  return getStripeClient().webhooks.constructEvent(
    payload,
    signature,
    requireBillingConfig().webhookSecret
  );
}

export async function syncCompletedCheckoutSession(
  session: Stripe.Checkout.Session
) {
  if (session.mode !== "subscription") {
    return;
  }

  const userId =
    session.metadata?.userId?.trim() || session.client_reference_id?.trim();
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;

  if (!userId || !customerId) {
    return;
  }

  await upsertBillingAccount({
    stripeCustomerId: customerId,
    userId,
  });
}

export async function syncStripeSubscription(
  subscription: Stripe.Subscription
) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const mappedAccount = await getBillingAccountByCustomerId(customerId);
  const userId = mappedAccount?.userId ?? subscription.metadata.userId?.trim();

  if (!userId) {
    throw new Error(
      `Stripe subscription ${subscription.id} could not be mapped to a Sentinel Flow user.`
    );
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const planKey =
    getPlanKeyForPriceId(priceId) ||
    (subscription.metadata.planKey &&
    getBillingPlan(subscription.metadata.planKey as BillingPlanKey)
      ? (subscription.metadata.planKey as BillingPlanKey)
      : null);
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end
    ? new Date(
        subscription.items.data[0].current_period_end * 1000
      ).toISOString()
    : null;
  const trialEndsAt = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;

  if (mappedAccount) {
    await updateBillingAccountByCustomerId({
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd,
      customerId,
      planKey,
      status: subscription.status,
      stripePriceId: priceId,
      stripeSubscriptionId: subscription.id,
      trialEndsAt,
    });

    return;
  }

  await upsertBillingAccount({
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd,
    planKey,
    status: subscription.status,
    stripeCustomerId: customerId,
    stripePriceId: priceId,
    stripeSubscriptionId: subscription.id,
    trialEndsAt,
    userId,
  });
}
