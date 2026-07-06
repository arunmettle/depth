import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { isBillingPlanKey, type BillingPlanKey } from "@/lib/billing/plans";

type BillingConfig = {
  priceIds: Partial<Record<BillingPlanKey, string>>;
  secretKey: string | null;
  siteUrl: string;
  trialDays: number | null;
  webhookSecret: string | null;
};

type RequiredBillingConfig = {
  priceIds: Partial<Record<BillingPlanKey, string>>;
  secretKey: string;
  siteUrl: string;
  trialDays: number | null;
  webhookSecret: string;
};

function parsePositiveInteger(value: string | undefined) {
  const parsed = Number(value?.trim() || "");

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function getBillingConfig(): BillingConfig {
  const supabaseConfig = getSupabasePublicConfig();
  const rawPriceIds = {
    alpha_stream: process.env.STRIPE_ALPHA_STREAM_PRICE_ID?.trim() || null,
    founding_access:
      process.env.STRIPE_FOUNDING_ACCESS_PRICE_ID?.trim() || null,
    scout: process.env.STRIPE_SCOUT_PRICE_ID?.trim() || null,
    sentinel_pro: process.env.STRIPE_SENTINEL_PRO_PRICE_ID?.trim() || null,
  } satisfies Record<string, string | null>;

  const priceIds = Object.entries(rawPriceIds).reduce<
    Partial<Record<BillingPlanKey, string>>
  >((result, [key, value]) => {
    if (value && isBillingPlanKey(key)) {
      result[key] = value;
    }

    return result;
  }, {});

  return {
    priceIds,
    secretKey: process.env.STRIPE_SECRET_KEY?.trim() || null,
    siteUrl: supabaseConfig.siteUrl,
    trialDays: parsePositiveInteger(process.env.STRIPE_CHECKOUT_TRIAL_DAYS),
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || null,
  };
}

export function isBillingConfigured() {
  const config = getBillingConfig();

  return Boolean(
    config.secretKey &&
      config.webhookSecret &&
      Object.values(config.priceIds).some(Boolean)
  );
}

export function getCheckoutPriceId(planKey: BillingPlanKey) {
  return getBillingConfig().priceIds[planKey] ?? null;
}

export function getPlanKeyForPriceId(priceId: string | null | undefined) {
  if (!priceId) {
    return null;
  }

  const priceIds = getBillingConfig().priceIds;
  const matchingEntry = Object.entries(priceIds).find(
    ([, configuredPriceId]) => configuredPriceId === priceId
  );

  return matchingEntry && isBillingPlanKey(matchingEntry[0])
    ? matchingEntry[0]
    : null;
}

export function requireBillingConfig(): RequiredBillingConfig {
  const config = getBillingConfig();

  if (!config.secretKey) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
  }

  if (!config.webhookSecret) {
    throw new Error(
      "Stripe webhook secret is missing. Set STRIPE_WEBHOOK_SECRET."
    );
  }

  return {
    priceIds: config.priceIds,
    secretKey: config.secretKey,
    siteUrl: config.siteUrl,
    trialDays: config.trialDays,
    webhookSecret: config.webhookSecret,
  };
}
