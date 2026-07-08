import { describe, expect, it } from "vitest";

import {
  createTelegramConnectionToken,
  verifyTelegramConnectionToken,
} from "@/lib/telegram/token";

describe("telegram connection tokens", () => {
  const secret = "sentinel-flow-test-secret";

  it("creates and verifies a valid token", () => {
    const token = createTelegramConnectionToken("user-123", 600, secret);
    const payload = verifyTelegramConnectionToken(token, secret);

    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("user-123");
    expect(payload?.type).toBe("telegram-connect");
  });

  it("rejects a tampered token", () => {
    const token = createTelegramConnectionToken("user-123", 600, secret);
    const tamperedToken = `${token}tampered`;

    expect(verifyTelegramConnectionToken(tamperedToken, secret)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = createTelegramConnectionToken("user-123", -1, secret);

    expect(verifyTelegramConnectionToken(token, secret)).toBeNull();
  });

  it("keeps uuid-backed tokens within Telegram deep-link limits", () => {
    const token = createTelegramConnectionToken(
      "86ecfc9c-dc1e-495e-8a9f-6b8189d586de",
      600,
      secret
    );

    expect(token.length).toBeLessThanOrEqual(64);
    expect(verifyTelegramConnectionToken(token, secret)?.sub).toBe(
      "86ecfc9c-dc1e-495e-8a9f-6b8189d586de"
    );
  });
});
