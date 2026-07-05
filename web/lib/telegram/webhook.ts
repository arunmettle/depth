import { timingSafeEqual } from "node:crypto";

import { getTelegramConfig } from "@/lib/telegram/config";

const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function getTelegramStartToken(text?: string | null) {
  if (!text) {
    return null;
  }

  const match = text.trim().match(/^\/start(?:@\w+)?(?:\s+(.+))?$/);

  if (!match) {
    return null;
  }

  return match[1]?.trim() ?? "";
}

export function isTelegramWebhookAuthorized(
  headers: Headers,
  secret = getTelegramConfig().webhookSecret
) {
  if (!secret) {
    return true;
  }

  const header = headers.get(TELEGRAM_SECRET_HEADER);

  if (!header) {
    return false;
  }

  return safeEqual(header, secret);
}
