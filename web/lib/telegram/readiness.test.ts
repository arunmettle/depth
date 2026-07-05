import { describe, expect, it } from "vitest";

import { getTelegramPairingReadiness } from "@/lib/telegram/readiness";

describe("telegram pairing readiness", () => {
  it("marks the slice complete when every prerequisite is configured", () => {
    const readiness = getTelegramPairingReadiness({
      auth: {
        email: "trader@example.com",
        isAuthenticated: true,
        isConfigured: true,
        userId: "user-123",
      },
      canPersistConnection: true,
      config: {
        botToken: "bot-token",
        botUsername: "sentinelflow_bot",
        linkSecret: "link-secret",
        webhookSecret: "webhook-secret",
      },
    });

    expect(readiness.complete).toBe(true);
    expect(readiness.items).toHaveLength(6);
    expect(readiness.items.every((item) => item.ready)).toBe(true);
  });

  it("surfaces actionable missing-state guidance when setup is incomplete", () => {
    const readiness = getTelegramPairingReadiness({
      auth: {
        email: null,
        isAuthenticated: false,
        isConfigured: false,
        userId: null,
      },
      canPersistConnection: false,
      config: {
        botToken: null,
        botUsername: null,
        linkSecret: null,
        webhookSecret: null,
      },
    });

    expect(readiness.complete).toBe(false);
    expect(readiness.items.find((item) => item.label === "Supabase auth")?.detail).toBe(
      "Add the Supabase URL and publishable key for real sessions."
    );
    expect(readiness.items.find((item) => item.label === "Persistence")?.detail).toBe(
      "Add SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY to persist pairings."
    );
    expect(readiness.items.find((item) => item.label === "Webhook secret")?.ready).toBe(
      false
    );
  });

  it("reports the configured bot username in the readiness detail", () => {
    const readiness = getTelegramPairingReadiness({
      auth: {
        email: "trader@example.com",
        isAuthenticated: true,
        isConfigured: true,
        userId: "user-123",
      },
      canPersistConnection: true,
      config: {
        botToken: "bot-token",
        botUsername: "sentinelflow_bot",
        linkSecret: "link-secret",
        webhookSecret: null,
      },
    });

    expect(readiness.items.find((item) => item.label === "Bot username")?.detail).toBe(
      "Bot username is set to @sentinelflow_bot."
    );
    expect(readiness.complete).toBe(false);
  });
});
