import type { AuthState } from "@/lib/supabase/server";
import type { TelegramConfig } from "@/lib/telegram/config";

export type TelegramPairingReadinessItem = {
  detail: string;
  label: string;
  ready: boolean;
};

export function getTelegramPairingReadiness(args: {
  auth: AuthState;
  canPersistConnection: boolean;
  config: TelegramConfig;
}) {
  const { auth, canPersistConnection, config } = args;
  const items: TelegramPairingReadinessItem[] = [
    {
      detail: auth.isConfigured
        ? "Supabase auth can identify the signed-in user."
        : "Add the Supabase URL and publishable key for real sessions.",
      label: "Supabase auth",
      ready: auth.isConfigured,
    },
    {
      detail: config.botToken
        ? "Telegram bot token is present for webhook processing."
        : "Add TELEGRAM_BOT_TOKEN so the app can receive bot updates.",
      label: "Bot token",
      ready: Boolean(config.botToken),
    },
    {
      detail: config.botUsername
        ? `Bot username is set to @${config.botUsername}.`
        : "Add TELEGRAM_BOT_USERNAME so the connect link can target the right bot.",
      label: "Bot username",
      ready: Boolean(config.botUsername),
    },
    {
      detail: config.linkSecret
        ? "Signed deep-link pairing is enabled."
        : "Add TELEGRAM_LINK_SECRET so public bot links stay signed and short-lived.",
      label: "Link secret",
      ready: Boolean(config.linkSecret),
    },
    {
      detail: canPersistConnection
        ? "Telegram connections can be saved with the admin client."
        : "Add SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY to persist pairings.",
      label: "Persistence",
      ready: canPersistConnection,
    },
    {
      detail: config.webhookSecret
        ? "Webhook secret verification is configured for production exposure."
        : "Add TELEGRAM_WEBHOOK_SECRET to harden inbound webhook requests.",
      label: "Webhook secret",
      ready: Boolean(config.webhookSecret),
    },
  ];

  return {
    complete: items.every((item) => item.ready),
    items,
  };
}
