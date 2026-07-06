import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing/stripe", () => ({
  constructStripeWebhookEvent: vi.fn(),
  syncCompletedCheckoutSession: vi.fn(),
  syncStripeSubscription: vi.fn(),
}));

import {
  constructStripeWebhookEvent,
  syncCompletedCheckoutSession,
  syncStripeSubscription,
} from "@/lib/billing/stripe";

import { POST } from "./route";

describe("stripe webhook route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects requests without a stripe signature", async () => {
    const response = await POST(new Request("http://localhost/api/stripe/webhook"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing Stripe signature header.",
    });
  });

  it("returns 400 when webhook verification fails", async () => {
    vi.mocked(constructStripeWebhookEvent).mockImplementation(() => {
      throw new Error("bad signature");
    });

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        body: "{}",
        headers: {
          "stripe-signature": "sig",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "bad signature",
    });
  });

  it("syncs completed checkout sessions", async () => {
    vi.mocked(constructStripeWebhookEvent).mockReturnValue({
      data: {
        object: {
          id: "cs_123",
          mode: "subscription",
        },
      },
      type: "checkout.session.completed",
    } as never);

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        body: "{}",
        headers: {
          "stripe-signature": "sig",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    expect(syncCompletedCheckoutSession).toHaveBeenCalledWith({
      id: "cs_123",
      mode: "subscription",
    });
  });

  it("syncs subscription lifecycle updates", async () => {
    vi.mocked(constructStripeWebhookEvent).mockReturnValue({
      data: {
        object: {
          id: "sub_123",
          status: "active",
        },
      },
      type: "customer.subscription.updated",
    } as never);

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        body: "{}",
        headers: {
          "stripe-signature": "sig",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    expect(syncStripeSubscription).toHaveBeenCalledWith({
      id: "sub_123",
      status: "active",
    });
  });

  it("returns 500 when sync work fails", async () => {
    vi.mocked(constructStripeWebhookEvent).mockReturnValue({
      data: {
        object: {
          id: "sub_123",
          status: "active",
        },
      },
      type: "customer.subscription.updated",
    } as never);
    vi.mocked(syncStripeSubscription).mockRejectedValue(
      new Error("sync failed")
    );

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        body: "{}",
        headers: {
          "stripe-signature": "sig",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "sync failed",
    });
  });
});
