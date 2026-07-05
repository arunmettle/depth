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
    const [payload, signature] = token.split(".");
    const tamperedToken = `${payload}.tampered${signature}`;

    expect(verifyTelegramConnectionToken(tamperedToken, secret)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = createTelegramConnectionToken("user-123", -1, secret);

    expect(verifyTelegramConnectionToken(token, secret)).toBeNull();
  });
});
