import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendTelegramMessage } from "@/lib/telegram/bot";
import {
  canPersistTelegramConnection,
  isTelegramConnectionConflictError,
  upsertTelegramConnection,
} from "@/lib/telegram/connections";
import { isTelegramWebhookConfigured } from "@/lib/telegram/config";
import { verifyTelegramConnectionToken } from "@/lib/telegram/token";
import {
  getTelegramStartToken,
  isTelegramWebhookAuthorized,
} from "@/lib/telegram/webhook";

import { POST } from "./route";

vi.mock("@/lib/telegram/bot", () => ({
  sendTelegramMessage: vi.fn(),
}));

vi.mock("@/lib/telegram/connections", () => ({
  canPersistTelegramConnection: vi.fn(),
  isTelegramConnectionConflictError: vi.fn(),
  upsertTelegramConnection: vi.fn(),
}));

vi.mock("@/lib/telegram/config", () => ({
  isTelegramWebhookConfigured: vi.fn(),
}));

vi.mock("@/lib/telegram/token", () => ({
  verifyTelegramConnectionToken: vi.fn(),
}));

vi.mock("@/lib/telegram/webhook", () => ({
  getTelegramStartToken: vi.fn(),
  isTelegramWebhookAuthorized: vi.fn(),
}));

function createRequest(text = "/start token-123", chatId = 12345) {
  return new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        chat: { id: chatId },
        from: { first_name: "Alex", username: "alextrades" },
        text,
      },
    }),
  });
}

describe("telegram webhook route", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(isTelegramWebhookConfigured).mockReturnValue(true);
    vi.mocked(isTelegramWebhookAuthorized).mockReturnValue(true);
    vi.mocked(getTelegramStartToken).mockReturnValue("token-123");
    vi.mocked(verifyTelegramConnectionToken).mockReturnValue({
      exp: Math.floor(Date.now() / 1000) + 600,
      sub: "user-123",
      type: "telegram-connect",
    });
    vi.mocked(canPersistTelegramConnection).mockReturnValue(true);
    vi.mocked(isTelegramConnectionConflictError).mockReturnValue(false);
    vi.mocked(upsertTelegramConnection).mockResolvedValue(undefined);
    vi.mocked(sendTelegramMessage).mockResolvedValue(undefined);
  });

  it("skips when the webhook is not configured", async () => {
    vi.mocked(isTelegramWebhookConfigured).mockReturnValue(false);

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      skipped: "telegram-not-configured",
    });
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("rejects unauthorized webhook requests", async () => {
    vi.mocked(isTelegramWebhookAuthorized).mockReturnValue(false);

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthorized",
      ok: false,
    });
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("prompts the user to reopen the connect link on plain start", async () => {
    vi.mocked(getTelegramStartToken).mockReturnValue("");

    const response = await POST(createRequest("/start"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      skipped: "missing-start-token",
    });
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      "12345",
      "Open the Telegram connect link from Sentinel Flow settings to finish pairing this account."
    );
    expect(upsertTelegramConnection).not.toHaveBeenCalled();
  });

  it("responds with guidance when the token is invalid", async () => {
    vi.mocked(verifyTelegramConnectionToken).mockReturnValue(null);

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      skipped: "invalid-token",
    });
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      "12345",
      "This Sentinel Flow connection link is invalid or has expired. Generate a fresh link from the web app settings page."
    );
    expect(upsertTelegramConnection).not.toHaveBeenCalled();
  });

  it("responds with setup guidance when Supabase admin persistence is unavailable", async () => {
    vi.mocked(canPersistTelegramConnection).mockReturnValue(false);

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      skipped: "supabase-admin-missing",
    });
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      "12345",
      "Sentinel Flow bot is reachable, but the server still needs its Supabase admin key before Telegram connections can be saved."
    );
    expect(upsertTelegramConnection).not.toHaveBeenCalled();
  });

  it("handles a chat-already-linked conflict gracefully", async () => {
    const conflictError = { code: "23505" };

    vi.mocked(upsertTelegramConnection).mockRejectedValue(conflictError);
    vi.mocked(isTelegramConnectionConflictError).mockReturnValue(true);

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      skipped: "chat-already-linked",
    });
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      "12345",
      "This Telegram chat is already linked to a different Sentinel Flow account. Disconnect it there first or use the original account."
    );
  });

  it("persists the connection and sends a success message", async () => {
    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(upsertTelegramConnection).toHaveBeenCalledWith("user-123", {
      chatId: "12345",
      firstName: "Alex",
      username: "alextrades",
    });
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      "12345",
      "Telegram is now connected to your Sentinel Flow account. You can return to the web app and continue configuring alerts."
    );
  });
});
