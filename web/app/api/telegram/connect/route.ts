import { NextResponse } from "next/server";

import { normalizeSafeNextPath } from "@/lib/auth/next";
import { getAuthState } from "@/lib/supabase/server";
import { getTelegramConfig, isTelegramLinkConfigured } from "@/lib/telegram/config";
import { createTelegramConnectionToken } from "@/lib/telegram/token";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const auth = await getAuthState();
  const settingsPath = normalizeSafeNextPath("/settings");

  if (!auth.isAuthenticated || !auth.userId) {
    const signInUrl = new URL("/sign-in", requestUrl.origin);
    signInUrl.searchParams.set("next", settingsPath);
    return NextResponse.redirect(signInUrl);
  }

  const config = getTelegramConfig();
  if (!isTelegramLinkConfigured() || !config.botUsername) {
    return NextResponse.redirect(new URL(settingsPath, requestUrl.origin));
  }

  const token = createTelegramConnectionToken(auth.userId);
  const target = new URL(`https://t.me/${config.botUsername}`);
  target.searchParams.set("start", token);

  return NextResponse.redirect(target);
}
