import { describe, expect, it } from "vitest";

import {
  getTelegramStartToken,
  isTelegramWebhookAuthorized,
} from "@/lib/telegram/webhook";

describe("telegram webhook helpers", () => {
  it("extracts a start token from a standard start command", () => {
    expect(getTelegramStartToken("/start token-123")).toBe("token-123");
  });

  it("extracts a start token from a bot-targeted start command", () => {
    expect(getTelegramStartToken("/start@sentinel_flow_bot token-123")).toBe(
      "token-123"
    );
  });

  it("returns an empty token for a plain start command", () => {
    expect(getTelegramStartToken("/start")).toBe("");
  });

  it("ignores unrelated messages", () => {
    expect(getTelegramStartToken("hello there")).toBeNull();
  });

  it("authorizes webhook requests when the header matches", () => {
    const headers = new Headers({
      "x-telegram-bot-api-secret-token": "secret-123",
    });

    expect(isTelegramWebhookAuthorized(headers, "secret-123")).toBe(true);
  });

  it("rejects webhook requests when the header is missing or wrong", () => {
    expect(isTelegramWebhookAuthorized(new Headers(), "secret-123")).toBe(false);

    const headers = new Headers({
      "x-telegram-bot-api-secret-token": "wrong-secret",
    });

    expect(isTelegramWebhookAuthorized(headers, "secret-123")).toBe(false);
  });
});
