export type TelegramConfig = {
  botToken: string | null;
  botUsername: string | null;
  linkSecret: string | null;
  webhookSecret: string | null;
};

export function getTelegramConfig(): TelegramConfig {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || null,
    botUsername: process.env.TELEGRAM_BOT_USERNAME?.trim() || null,
    linkSecret: process.env.TELEGRAM_LINK_SECRET?.trim() || null,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null,
  };
}

export function isTelegramLinkConfigured() {
  const config = getTelegramConfig();

  return Boolean(config.botUsername && config.linkSecret);
}

export function isTelegramWebhookConfigured() {
  const config = getTelegramConfig();

  return Boolean(config.botToken && config.linkSecret);
}
