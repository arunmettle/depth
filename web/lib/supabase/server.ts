import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import {
  isSupabaseConfigured,
  requireSupabasePublicConfig,
} from "@/lib/supabase/config";

export type AuthState = {
  email: string | null;
  isAuthenticated: boolean;
  isConfigured: boolean;
  userId: string | null;
};

export async function createClient() {
  const config = requireSupabasePublicConfig();
  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, options, value }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components can read cookies without mutating them.
        }
      },
    },
  });
}

export async function getAuthState(): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return {
      email: null,
      isAuthenticated: false,
      isConfigured: false,
      userId: null,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    email: user?.email ?? null,
    isAuthenticated: Boolean(user),
    isConfigured: true,
    userId: user?.id ?? null,
  };
}
