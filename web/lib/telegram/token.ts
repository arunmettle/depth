import { createHmac, timingSafeEqual } from "node:crypto";

import { getTelegramConfig } from "@/lib/telegram/config";

type TelegramConnectPayload = {
  exp: number;
  sub: string;
  type: "telegram-connect";
};

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function createSignature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function requireLinkSecret() {
  const secret = getTelegramConfig().linkSecret;

  if (!secret) {
    throw new Error("Telegram link secret is missing.");
  }

  return secret;
}

function getLinkSecret(secret?: string) {
  return secret ?? requireLinkSecret();
}

export function createTelegramConnectionToken(
  userId: string,
  ttlSeconds = 600,
  secret?: string
) {
  const payload: TelegramConnectPayload = {
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    sub: userId,
    type: "telegram-connect",
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = createSignature(encodedPayload, getLinkSecret(secret));

  return `${encodedPayload}.${signature}`;
}

export function verifyTelegramConnectionToken(token: string, secret?: string) {
  const [encodedPayload, providedSignature] = token.split(".");

  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = createSignature(
    encodedPayload,
    getLinkSecret(secret)
  );
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  const payload = JSON.parse(
    decodeBase64Url(encodedPayload)
  ) as TelegramConnectPayload;

  if (payload.type !== "telegram-connect") {
    return null;
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
