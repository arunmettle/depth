import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

import { GET } from "./route";

describe("auth callback route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue(undefined),
      },
    } as never);
  });

  it("exchanges the auth code and redirects to a safe internal next path", async () => {
    const response = await GET(
      new Request("http://localhost/auth/callback?code=abc123&next=%2Fsettings") as never
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/settings");
    expect(
      vi.mocked(createClient).mock.results[0]?.value instanceof Promise
    ).toBe(true);
  });

  it("falls back to the dashboard for unsafe next paths", async () => {
    const response = await GET(
      new Request(
        "http://localhost/auth/callback?code=abc123&next=https%3A%2F%2Fevil.example"
      ) as never
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("redirects without exchanging when there is no code", async () => {
    const response = await GET(
      new Request("http://localhost/auth/callback?next=%2Fsettings") as never
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/settings");
    expect(createClient).not.toHaveBeenCalled();
  });
});
