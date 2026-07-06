import { describe, expect, it } from "vitest";

import { getLaunchReadiness } from "@/lib/launch-readiness";

describe("launch readiness", () => {
  it("reports a complete launch state when every production gate is live", () => {
    const readiness = getLaunchReadiness({
      auth: {
        email: "trader@example.com",
        isAuthenticated: true,
        isConfigured: true,
        userId: "user-1",
      },
      billingAccount: {
        cancelAtPeriodEnd: false,
        createdAt: "2026-07-06T10:00:00.000Z",
        currentPeriodEnd: "2026-08-06T10:00:00.000Z",
        plan: {
          activeRuleLimit: null,
          ctaLabel: "Start Founding Access",
          description: "Launch plan",
          launchBadge: "Launch pricing",
          name: "Founding Access",
          priceLabel: "$39/mo",
          rank: 3,
        },
        planKey: "founding_access",
        status: "active",
        stripeCustomerId: "cus_123",
        stripePriceId: "price_123",
        stripeSubscriptionId: "sub_123",
        trialEndsAt: null,
        updatedAt: "2026-07-06T10:00:00.000Z",
        userId: "user-1",
      },
      engine: {
        connected: true,
        deliveryStatus: "configured",
        dispatchAttempts: 2,
        deliveredAlerts: 1,
        lastDeliveryStatus: "delivered",
        persistedWrites: 1,
        recentAlertCount: 1,
        retryAttempts: 0,
        ruleSource: "supabase",
        source: "engine",
      },
      rules: [
        {
          createdAt: "2026-07-06T10:00:00.000Z",
          destination: "telegram",
          id: "rule-1",
          marketSymbol: "BTCUSDT",
          name: "BTC active",
          params: {
            confirmationRows: 3,
            thresholdMultiplier: 300,
          },
          ruleType: "stacked_imbalance",
          status: "active",
          timeframe: "5m",
          updatedAt: "2026-07-06T10:00:00.000Z",
          userId: "user-1",
        },
      ],
      telegramConnection: {
        connectedAt: "2026-07-06T10:00:00.000Z",
        firstName: "Trader",
        lastSeenAt: "2026-07-06T10:01:00.000Z",
        telegramChatId: "123456",
        telegramUsername: "trader",
        userId: "user-1",
      },
      telegramReadiness: {
        complete: true,
        items: [],
      },
    });

    expect(readiness.complete).toBe(true);
    expect(readiness.items).toHaveLength(5);
    expect(readiness.items.every((item) => item.ready)).toBe(true);
  });

  it("surfaces the first missing production gate details when launch is incomplete", () => {
    const readiness = getLaunchReadiness({
      auth: {
        email: null,
        isAuthenticated: false,
        isConfigured: false,
        userId: null,
      },
      billingAccount: null,
      engine: null,
      rules: [],
      telegramConnection: null,
      telegramReadiness: {
        complete: false,
        items: [
          {
            detail: "Add TELEGRAM_BOT_TOKEN.",
            label: "Bot token",
            ready: false,
          },
        ],
      },
    });

    expect(readiness.complete).toBe(false);
    expect(readiness.items.find((item) => item.label === "Operator session")?.detail).toContain(
      "Supabase URL"
    );
    expect(
      readiness.items.find((item) => item.label === "Telegram delivery path")?.detail
    ).toContain("bot token");
    expect(readiness.items.find((item) => item.label === "Paid billing access")?.ready).toBe(
      false
    );
    expect(readiness.items.find((item) => item.label === "Live alert rules")?.ready).toBe(
      false
    );
    expect(readiness.items.find((item) => item.label === "Engine visibility")?.ready).toBe(
      false
    );
  });
});
