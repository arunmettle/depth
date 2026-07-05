type SupabasePublicConfig = {
  publishableKey: string | null;
  siteUrl: string;
  url: string | null;
};

type RequiredSupabasePublicConfig = {
  publishableKey: string;
  siteUrl: string;
  url: string;
};

export function getSupabasePublicConfig(): SupabasePublicConfig {
  return {
    publishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || null,
    siteUrl:
      process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000",
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null,
  };
}

export function isSupabaseConfigured() {
  const config = getSupabasePublicConfig();

  return Boolean(config.url && config.publishableKey);
}

export function requireSupabasePublicConfig(): RequiredSupabasePublicConfig {
  const config = getSupabasePublicConfig();

  if (!config.url || !config.publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  return {
    publishableKey: config.publishableKey,
    siteUrl: config.siteUrl,
    url: config.url,
  };
}
