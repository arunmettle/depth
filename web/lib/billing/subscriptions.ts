import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  getBillingPlan,
  hasPaidBillingAccess,
  type BillingPlanKey,
  type BillingSubscriptionStatus,
} from "@/lib/billing/plans";

export type BillingAccount = {
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  currentPeriodEnd: string | null;
  plan: ReturnType<typeof getBillingPlan>;
  planKey: BillingPlanKey | null;
  status: BillingSubscriptionStatus;
  stripeCustomerId: string | null;
  stripePriceId: string | null;
  stripeSubscriptionId: string | null;
  trialEndsAt: string | null;
  updatedAt: string;
  userId: string;
};

type BillingAccountRow = {
  cancel_at_period_end: boolean;
  created_at: string;
  current_period_end: string | null;
  plan_key: BillingPlanKey | null;
  stripe_customer_id: string | null;
  stripe_price_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: BillingSubscriptionStatus;
  trial_ends_at: string | null;
  updated_at: string;
  user_id: string;
};

type BillingAccountWriteInput = {
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | null;
  planKey?: BillingPlanKey | null;
  status?: BillingSubscriptionStatus;
  stripeCustomerId?: string | null;
  stripePriceId?: string | null;
  stripeSubscriptionId?: string | null;
  trialEndsAt?: string | null;
  userId: string;
};

function mapBillingAccount(row: BillingAccountRow): BillingAccount {
  return {
    cancelAtPeriodEnd: row.cancel_at_period_end,
    createdAt: row.created_at,
    currentPeriodEnd: row.current_period_end,
    plan: getBillingPlan(row.plan_key),
    planKey: row.plan_key,
    status: row.subscription_status,
    stripeCustomerId: row.stripe_customer_id,
    stripePriceId: row.stripe_price_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    trialEndsAt: row.trial_ends_at,
    updatedAt: row.updated_at,
    userId: row.user_id,
  };
}

function getBillingAccountSelect() {
  return "cancel_at_period_end,created_at,current_period_end,plan_key,stripe_customer_id,stripe_price_id,stripe_subscription_id,subscription_status,trial_ends_at,updated_at,user_id";
}

export function canPersistBillingAccount() {
  return isSupabaseAdminConfigured();
}

export async function getBillingAccountForCurrentUser() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("billing_accounts")
    .select(getBillingAccountSelect())
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapBillingAccount(data as unknown as BillingAccountRow);
}

export async function getBillingAccountByCustomerId(customerId: string) {
  if (!canPersistBillingAccount()) {
    return null;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("billing_accounts")
    .select(getBillingAccountSelect())
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapBillingAccount(data as unknown as BillingAccountRow);
}

export async function upsertBillingAccount(input: BillingAccountWriteInput) {
  const supabase = createAdminClient();
  const timestamp = new Date().toISOString();

  const { error } = await supabase.from("billing_accounts").upsert(
    {
      cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
      current_period_end: input.currentPeriodEnd ?? null,
      plan_key: input.planKey ?? null,
      stripe_customer_id: input.stripeCustomerId ?? null,
      stripe_price_id: input.stripePriceId ?? null,
      stripe_subscription_id: input.stripeSubscriptionId ?? null,
      subscription_status: input.status ?? "inactive",
      trial_ends_at: input.trialEndsAt ?? null,
      updated_at: timestamp,
      user_id: input.userId,
    },
    {
      onConflict: "user_id",
    }
  );

  if (error) {
    throw error;
  }
}

export async function updateBillingAccountByCustomerId(args: {
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | null;
  customerId: string;
  planKey?: BillingPlanKey | null;
  status?: BillingSubscriptionStatus;
  stripePriceId?: string | null;
  stripeSubscriptionId?: string | null;
  trialEndsAt?: string | null;
}) {
  const supabase = createAdminClient();
  const timestamp = new Date().toISOString();
  const { error } = await supabase
    .from("billing_accounts")
    .update({
      cancel_at_period_end: args.cancelAtPeriodEnd ?? false,
      current_period_end: args.currentPeriodEnd ?? null,
      plan_key: args.planKey ?? null,
      stripe_price_id: args.stripePriceId ?? null,
      stripe_subscription_id: args.stripeSubscriptionId ?? null,
      subscription_status: args.status ?? "inactive",
      trial_ends_at: args.trialEndsAt ?? null,
      updated_at: timestamp,
    })
    .eq("stripe_customer_id", args.customerId);

  if (error) {
    throw error;
  }
}

export function getBillingOverview(account: BillingAccount | null) {
  if (!account) {
    return {
      accessActive: false,
      planName: "No active plan",
      status: "inactive" as BillingSubscriptionStatus,
    };
  }

  return {
    accessActive: hasPaidBillingAccess(account.status),
    planName: account.plan?.name ?? "Unmapped plan",
    status: account.status,
  };
}
