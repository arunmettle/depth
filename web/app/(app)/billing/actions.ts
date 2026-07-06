"use server";

import { redirect } from "next/navigation";

import {
  createCheckoutSessionUrl,
  createCustomerPortalUrl,
} from "@/lib/billing/stripe";
import { getBillingAccountForCurrentUser } from "@/lib/billing/subscriptions";
import { isBillingPlanKey, type BillingPlanKey } from "@/lib/billing/plans";
import { getAuthState } from "@/lib/supabase/server";

function redirectToBillingError(code: string): never {
  redirect(`/billing?error=${encodeURIComponent(code)}`);
}

export async function startCheckout(formData: FormData) {
  const auth = await getAuthState();

  if (!auth.isAuthenticated || !auth.userId) {
    redirect("/sign-in?next=%2Fbilling");
  }

  const planKey = String(formData.get("planKey") ?? "").trim();

  if (!isBillingPlanKey(planKey)) {
    redirectToBillingError("invalid-plan");
  }

  const selectedPlanKey: BillingPlanKey = planKey;

  const billingAccount = await getBillingAccountForCurrentUser();

  if (billingAccount?.stripeSubscriptionId && billingAccount.stripeCustomerId) {
    const portalUrl = await createCustomerPortalUrl(
      billingAccount.stripeCustomerId
    );
    redirect(portalUrl);
  }

  const checkoutUrl = await createCheckoutSessionUrl({
    email: auth.email,
    existingCustomerId: billingAccount?.stripeCustomerId ?? null,
    planKey: selectedPlanKey,
    userId: auth.userId,
  });

  redirect(checkoutUrl);
}

export async function openBillingPortal() {
  const auth = await getAuthState();

  if (!auth.isAuthenticated) {
    redirect("/sign-in?next=%2Fbilling");
  }

  const billingAccount = await getBillingAccountForCurrentUser();

  if (!billingAccount?.stripeCustomerId) {
    redirectToBillingError("missing-customer");
  }

  const portalUrl = await createCustomerPortalUrl(
    billingAccount.stripeCustomerId
  );
  redirect(portalUrl);
}
