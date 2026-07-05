import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/lib/supabase/config", () => ({
  getSupabasePublicConfig: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { headers } from "next/headers";

import {
  getSupabasePublicConfig,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

import { requestMagicLink } from "./actions";

describe("requestMagicLink", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(getSupabasePublicConfig).mockReturnValue({
      publishableKey: "pk_test",
      siteUrl: "http://fallback.example",
      url: "http://supabase.example",
    });
    vi.mocked(headers).mockResolvedValue(
      new Headers({
        origin: "http://localhost:3000",
      }) as never
    );
  });

  it("uses the provided safe next path in the magic-link callback url", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        signInWithOtp,
      },
    } as never);

    const formData = new FormData();
    formData.set("email", "trader@example.com");
    formData.set("next", "/settings");

    const result = await requestMagicLink(
      { message: null, status: "idle" },
      formData
    );

    expect(result.status).toBe("success");
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "trader@example.com",
      options: {
        emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fsettings",
      },
    });
  });

  it("falls back to the dashboard for unsafe next paths", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        signInWithOtp,
      },
    } as never);

    const formData = new FormData();
    formData.set("email", "trader@example.com");
    formData.set("next", "https://evil.example");

    await requestMagicLink({ message: null, status: "idle" }, formData);

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "trader@example.com",
      options: {
        emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fdashboard",
      },
    });
  });
});
