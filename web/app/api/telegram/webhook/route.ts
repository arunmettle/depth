import { NextResponse } from "next/server";

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

type TelegramUpdate = {
  message?: {
    chat?: {
      id?: number;
    };
    from?: {
      first_name?: string;
      username?: string;
    };
    text?: string;
  };
};

export async function POST(request: Request) {
  if (!isTelegramWebhookConfigured()) {
    return NextResponse.json({ ok: true, skipped: "telegram-not-configured" });
  }

  if (!isTelegramWebhookAuthorized(request.headers)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const token = getTelegramStartToken(update.message?.text);
  const chatId = update.message?.chat?.id;

  if (!token || !chatId) {
    if (token === "" && chatId) {
      await sendTelegramMessage(
        String(chatId),
        "Open the Telegram connect link from Sentinel Flow settings to finish pairing this account."
      );

      return NextResponse.json({ ok: true, skipped: "missing-start-token" });
    }

    return NextResponse.json({ ok: true, skipped: "no-start-token" });
  }

  const payload = verifyTelegramConnectionToken(token);

  if (!payload) {
    await sendTelegramMessage(
      String(chatId),
      "This Sentinel Flow connection link is invalid or has expired. Generate a fresh link from the web app settings page."
    );

    return NextResponse.json({ ok: true, skipped: "invalid-token" });
  }

  if (!canPersistTelegramConnection()) {
    await sendTelegramMessage(
      String(chatId),
      "Sentinel Flow bot is reachable, but the server still needs its Supabase admin key before Telegram connections can be saved."
    );

    return NextResponse.json({ ok: true, skipped: "supabase-admin-missing" });
  }

  let chatAlreadyLinked = false;

  try {
    await upsertTelegramConnection(payload.sub, {
      chatId: String(chatId),
      firstName: update.message?.from?.first_name ?? null,
      username: update.message?.from?.username ?? null,
    });
  } catch (error: unknown) {
    if (isTelegramConnectionConflictError(error)) {
      await sendTelegramMessage(
        String(chatId),
        "This Telegram chat is already linked to a different Sentinel Flow account. Disconnect it there first or use the original account."
      );
      chatAlreadyLinked = true;
    } else {
      throw error;
    }
  }

  if (chatAlreadyLinked) {
    return NextResponse.json({ ok: true, skipped: "chat-already-linked" });
  }

  await sendTelegramMessage(
    String(chatId),
    "Telegram is now connected to your Sentinel Flow account. You can return to the web app and continue configuring alerts."
  );

  return NextResponse.json({ ok: true });
}
