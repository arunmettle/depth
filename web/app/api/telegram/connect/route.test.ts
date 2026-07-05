import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getAuthState: vi.fn(),
}));

vi.mock("@/lib/telegram/config", () => ({
  getTelegramConfig: vi.fn(),
  isTelegramLinkConfigured: vi.fn(),
}));

vi.mock("@/lib/telegram/token", () => ({
  createTelegramConnectionToken: vi.fn(),
}));

import { getAuthState } from "@/lib/supabase/server";
import { getTelegramConfig, isTelegramLinkConfigured } from "@/lib/telegram/config";
import { createTelegramConnectionToken } from "@/lib/telegram/token";

import { GET } from "./route";

describe("telegram connect route", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(getAuthState).mockResolvedValue({
      email: "trader@example.com",
      isAuthenticated: true,
      isConfigured: true,
      userId: "user-123",
    });
    vi.mocked(getTelegramConfig).mockReturnValue({
      botToken: "bot-token",
      botUsername: "sentinelflow_bot",
      linkSecret: "link-secret",
      webhookSecret: "webhook-secret",
    });
    vi.mocked(isTelegramLinkConfigured).mockReturnValue(true);
    vi.mocked(createTelegramConnectionToken).mockReturnValue("fresh-token");
  });

  it("redirects unauthenticated requests to sign in", async () => {
    vi.mocked(getAuthState).mockResolvedValue({
      email: null,
      isAuthenticated: false,
      isConfigured: true,
      userId: null,
    });

    const response = await GET(new Request("http://localhost/api/telegram/connect"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/sign-in?next=%2Fsettings"
    );
    expect(createTelegramConnectionToken).not.toHaveBeenCalled();
  });

  it("redirects back to settings when link configuration is missing", async () => {
    vi.mocked(isTelegramLinkConfigured).mockReturnValue(false);

    const response = await GET(new Request("http://localhost/api/telegram/connect"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/settings");
    expect(createTelegramConnectionToken).not.toHaveBeenCalled();
  });

  it("redirects to telegram with a fresh token when authenticated and configured", async () => {
    const response = await GET(new Request("http://localhost/api/telegram/connect"));

    expect(response.status).toBe(307);
    expect(createTelegramConnectionToken).toHaveBeenCalledWith("user-123");
    expect(response.headers.get("location")).toBe(
      "https://t.me/sentinelflow_bot?start=fresh-token"
    );
  });
});
