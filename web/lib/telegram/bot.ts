import { getTelegramConfig } from "@/lib/telegram/config";

export async function sendTelegramMessage(chatId: string, text: string) {
  const config = getTelegramConfig();

  if (!config.botToken) {
    return;
  }

  await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
}
