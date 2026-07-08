import { createHmac, timingSafeEqual } from "node:crypto";

import { getTelegramConfig } from "@/lib/telegram/config";

type TelegramConnectPayload = {
  exp: number;
  sub: string;
  type: "telegram-connect";
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_HEX_PATTERN = /^[0-9a-f]{32}$/i;

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function createSignature(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(payload)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

function compactSubject(userId: string) {
  if (UUID_PATTERN.test(userId)) {
    return userId.replace(/-/g, "").toLowerCase();
  }

  return encodeBase64Url(userId);
}

function expandSubject(subject: string) {
  if (UUID_HEX_PATTERN.test(subject)) {
    return [
      subject.slice(0, 8),
      subject.slice(8, 12),
      subject.slice(12, 16),
      subject.slice(16, 20),
      subject.slice(20),
    ].join("-");
  }

  return decodeBase64Url(subject);
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
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const encodedExp = exp.toString(36);
  const subject = compactSubject(userId);
  const encodedPayload = `${encodedExp}_${subject}`;
  const signature = createSignature(encodedPayload, getLinkSecret(secret));

  return `${encodedPayload}_${signature}`;
}

export function verifyTelegramConnectionToken(token: string, secret?: string) {
  const firstSeparator = token.indexOf("_");
  const secondSeparator = token.indexOf("_", firstSeparator + 1);

  if (firstSeparator === -1 || secondSeparator === -1) {
    return null;
  }

  const encodedExp = token.slice(0, firstSeparator);
  const subject = token.slice(firstSeparator + 1, secondSeparator);
  const providedSignature = token.slice(secondSeparator + 1);

  if (!encodedExp || !subject || !providedSignature) {
    return null;
  }

  const encodedPayload = `${encodedExp}_${subject}`;
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

  const exp = Number.parseInt(encodedExp, 36);

  if (!Number.isFinite(exp)) {
    return null;
  }

  const payload: TelegramConnectPayload = {
    exp,
    sub: expandSubject(subject),
    type: "telegram-connect",
  };

  if (payload.type !== "telegram-connect") {
    return null;
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
