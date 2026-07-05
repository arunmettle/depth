import Link from "next/link";

import { disconnectTelegramConnection } from "@/app/(app)/settings/actions";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAuthState } from "@/lib/supabase/server";
import {
  canPersistTelegramConnection,
  getTelegramConnectionForCurrentUser,
} from "@/lib/telegram/connections";
import { getTelegramConfig, isTelegramLinkConfigured } from "@/lib/telegram/config";
import { getTelegramConnectionFacts } from "@/lib/telegram/presentation";
import { getTelegramPairingReadiness } from "@/lib/telegram/readiness";
import { cn } from "@/lib/utils";

function ReadinessBadge({ ready }: { ready: boolean }) {
  return <Badge variant={ready ? "outline" : "secondary"}>{ready ? "Ready" : "Missing"}</Badge>;
}

export default async function SettingsPage() {
  const auth = await getAuthState();
  const connection = auth.isAuthenticated
    ? await getTelegramConnectionForCurrentUser()
    : null;
  const telegramConfig = getTelegramConfig();
  const hasWebhookSecret = Boolean(telegramConfig.webhookSecret);
  const persistenceReady = canPersistTelegramConnection();
  const canGenerateLink =
    auth.isAuthenticated &&
    auth.userId &&
    isTelegramLinkConfigured() &&
    Boolean(telegramConfig.botUsername);
  const connectionFacts = connection ? getTelegramConnectionFacts(connection) : [];
  const readiness = getTelegramPairingReadiness({
    auth,
    canPersistConnection: persistenceReady,
    config: telegramConfig,
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>Connection settings</CardTitle>
          <CardDescription>
            Keep alert delivery setup clear and lightweight so pairing stays
            simple for traders and safe for production use.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-medium">Supabase auth</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {auth.isConfigured
                ? "Configured and ready for real user sessions."
                : "Waiting for project URL and publishable key."}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-medium">Telegram bot pairing</p>
            <div className="mt-2 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={connection ? "default" : "secondary"}>
                  {connection ? "Connected" : "Not connected"}
                </Badge>
                <Badge variant={isTelegramLinkConfigured() ? "outline" : "secondary"}>
                  {isTelegramLinkConfigured() ? "Deep-link ready" : "Bot config missing"}
                </Badge>
                <Badge variant={hasWebhookSecret ? "outline" : "secondary"}>
                  {hasWebhookSecret ? "Webhook hardened" : "Webhook secret missing"}
                </Badge>
                <Badge variant={persistenceReady ? "outline" : "secondary"}>
                  {persistenceReady ? "Persistence ready" : "Admin key missing"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {connection
                  ? `Connected chat ${connection.telegramChatId}${
                      connection.telegramUsername
                        ? ` as @${connection.telegramUsername}`
                        : ""
                    }.`
                  : "Generate a secure Telegram deep link, open the bot, and complete /start pairing from your Telegram account."}
              </p>
              {telegramConfig.botUsername ? (
                <p className="text-sm text-muted-foreground">
                  Pairing bot: <span className="font-medium text-foreground">@{telegramConfig.botUsername}</span>
                </p>
              ) : null}
              {connectionFacts.length ? (
                <div className="grid gap-2 rounded-lg border border-border/70 px-3 py-3 sm:grid-cols-2">
                  {connectionFacts.map((fact) => (
                    <div key={fact.label} className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        {fact.label}
                      </p>
                      <p className="text-sm text-foreground">{fact.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row">
                {canGenerateLink ? (
                  <Link
                    href="/api/telegram/connect"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonVariants({ variant: "default" }))}
                  >
                    Connect Telegram bot
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Add Telegram bot credentials and link secret to enable secure pairing.
                  </span>
                )}
                {connection ? (
                  <form action={disconnectTelegramConnection}>
                    <button
                      type="submit"
                      className={cn(buttonVariants({ variant: "outline" }))}
                    >
                      Disconnect Telegram
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Pairing readiness</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  These checks keep Telegram setup predictable before we ask a real user to pair.
                </p>
              </div>
              <Badge variant={readiness.complete ? "default" : "secondary"}>
                {readiness.complete ? "Launch-ready" : "Setup incomplete"}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3">
              {readiness.items.map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col gap-2 rounded-lg border border-border/70 px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-sm text-muted-foreground">{item.detail}</p>
                  </div>
                  <ReadinessBadge ready={item.ready} />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Product guardrails</CardTitle>
          <CardDescription>
            These constraints keep the settings experience clean as the product
            grows.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            The Telegram bot uses signed deep links so the web app does not
            expose raw account identifiers in public bot URLs.
          </p>
          <p>
            Telegram connection writes use a separate Supabase admin client, in
            line with Supabase guidance to keep secret-key actions out of SSR
            session clients.
          </p>
          <p>
            Only supported markets, timeframes, and rules will be configurable
            in v1.
          </p>
          <p>
            Read-only account surfaces come after the core alert loop proves
            trustworthy.
          </p>
          <p>No hidden advanced mode until repetition proves we need it.</p>
        </CardContent>
      </Card>
    </div>
  );
}
