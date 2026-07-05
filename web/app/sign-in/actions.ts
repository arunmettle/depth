"use server";

import { headers } from "next/headers";

import { normalizeSafeNextPath } from "@/lib/auth/next";
import {
  getSupabasePublicConfig,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type SignInState = {
  message: string | null;
  status: "error" | "idle" | "success";
};

export async function requestMagicLink(
  _previousState: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const next = normalizeSafeNextPath(String(formData.get("next") ?? "") || undefined);

  if (!email) {
    return {
      message: "Enter an email address to receive your magic link.",
      status: "error",
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      message:
        "Supabase is not configured yet. Add the public project URL and publishable key to continue.",
      status: "error",
    };
  }

  const supabase = await createClient();
  const requestHeaders = await headers();
  const config = getSupabasePublicConfig();
  const origin = requestHeaders.get("origin") ?? config.siteUrl;
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
    },
  });

  if (error) {
    return {
      message: error.message,
      status: "error",
    };
  }

  return {
    message: "Check your inbox for the Sentinel Flow magic link.",
    status: "success",
  };
}
