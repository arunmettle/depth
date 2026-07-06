import type {
  AlertRule,
  StackedImbalanceParams,
  SupportedMarket,
  SupportedRuleType,
  SupportedStatus,
  SupportedTimeframe,
  TrappedTradersParams,
} from "@/lib/alerts/schema";
import {
  supportedMarkets,
  supportedRuleTypes,
  supportedStatuses,
  supportedTimeframes,
} from "@/lib/alerts/schema";
import { getActiveRuleLimitForSubscription } from "@/lib/billing/plans";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export {
  supportedMarkets,
  supportedRuleTypes,
  supportedStatuses,
  supportedTimeframes,
};

type AlertRuleRow = {
  created_at: string;
  destination: "telegram";
  id: string;
  market_symbol: SupportedMarket;
  name: string;
  params: StackedImbalanceParams | TrappedTradersParams;
  rule_type: SupportedRuleType;
  status: SupportedStatus;
  timeframe: SupportedTimeframe;
  updated_at: string;
  user_id: string;
};

type BillingAccountAccessRow = {
  plan_key: "scout" | "founding_access" | "sentinel_pro" | "alpha_stream" | null;
  subscription_status:
    | "active"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "inactive"
    | "past_due"
    | "paused"
    | "trialing"
    | "unpaid";
};

function mapAlertRule(row: AlertRuleRow): AlertRule {
  return {
    createdAt: row.created_at,
    destination: row.destination,
    id: row.id,
    marketSymbol: row.market_symbol,
    name: row.name,
    params: row.params,
    ruleType: row.rule_type,
    status: row.status,
    timeframe: row.timeframe,
    updatedAt: row.updated_at,
    userId: row.user_id,
  };
}

export async function getAlertRulesForCurrentUser() {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("alert_rules")
    .select(
      "created_at,destination,id,market_symbol,name,params,rule_type,status,timeframe,updated_at,user_id"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row) => mapAlertRule(row as AlertRuleRow));
}

export async function getAlertRuleForCurrentUser(ruleId: string) {
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
    .from("alert_rules")
    .select(
      "created_at,destination,id,market_symbol,name,params,rule_type,status,timeframe,updated_at,user_id"
    )
    .eq("user_id", user.id)
    .eq("id", ruleId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapAlertRule(data as AlertRuleRow);
}

export async function upsertAlertRuleForCurrentUser(input: {
  id?: string;
  marketSymbol: SupportedMarket;
  name: string;
  params: StackedImbalanceParams | TrappedTradersParams;
  ruleType: SupportedRuleType;
  status: SupportedStatus;
  timeframe: SupportedTimeframe;
}) {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY before saving rules."
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to save an alert rule.");
  }

  const { data: billingAccount } = await supabase
    .from("billing_accounts")
    .select("plan_key,subscription_status")
    .eq("user_id", user.id)
    .maybeSingle();

  const activeRuleLimit = getActiveRuleLimitForSubscription({
    planKey: (billingAccount as BillingAccountAccessRow | null)?.plan_key ?? null,
    status:
      (billingAccount as BillingAccountAccessRow | null)?.subscription_status ??
      "inactive",
  });

  if (input.status === "active") {
    const { data: activeRules, error: activeRulesError } = await supabase
      .from("alert_rules")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (activeRulesError) {
      throw activeRulesError;
    }

    const activeRuleCount = activeRules?.length ?? 0;
    const isExistingActiveRule = Boolean(
      input.id && activeRules?.some((rule) => rule.id === input.id)
    );

    if (activeRuleLimit === 0) {
      throw new Error(
        "Start a paid plan on Billing before activating live alert rules."
      );
    }

    if (
      activeRuleLimit !== null &&
      !isExistingActiveRule &&
      activeRuleCount >= activeRuleLimit
    ) {
      throw new Error(
        `Your current plan supports ${activeRuleLimit} active alert rules. Pause one or upgrade on Billing to activate another.`
      );
    }
  }

  const timestamp = new Date().toISOString();
  const payload = {
    destination: "telegram" as const,
    id: input.id,
    market_symbol: input.marketSymbol,
    name: input.name,
    params: input.params,
    rule_type: input.ruleType,
    status: input.status,
    timeframe: input.timeframe,
    updated_at: timestamp,
    user_id: user.id,
  };

  if (input.id) {
    const { error } = await supabase
      .from("alert_rules")
      .update(payload)
      .eq("id", input.id)
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await supabase.from("alert_rules").insert({
    ...payload,
    created_at: timestamp,
  });

  if (error) {
    throw error;
  }
}

export async function deleteAlertRuleForCurrentUser(ruleId: string) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { error } = await supabase
    .from("alert_rules")
    .delete()
    .eq("id", ruleId)
    .eq("user_id", user.id);

  if (error) {
    throw error;
  }
}
