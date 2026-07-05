#!/usr/bin/env node

const TELEGRAM_BOT_TOKEN = getEnv("TELEGRAM_BOT_TOKEN");
const TELEGRAM_BASE_URL = getEnv("TELEGRAM_BASE_URL") || "https://api.telegram.org";
const SITE_URL = getEnv("NEXT_PUBLIC_SITE_URL");
const TELEGRAM_WEBHOOK_SECRET = getEnv("TELEGRAM_WEBHOOK_SECRET");
const DROP_PENDING_UPDATES = getEnv("TELEGRAM_WEBHOOK_DROP_PENDING_UPDATES") === "true";
const DELETE_WEBHOOK = process.argv.includes("--delete");

async function main() {
  const missing = [];

  if (!TELEGRAM_BOT_TOKEN) {
    missing.push("TELEGRAM_BOT_TOKEN");
  }

  if (!DELETE_WEBHOOK && !SITE_URL) {
    missing.push("NEXT_PUBLIC_SITE_URL");
  }

  if (missing.length) {
    console.error("Telegram webhook configuration is not ready.");
    for (const item of missing) {
      console.error(`- Missing ${item}`);
    }
    console.error("");
    console.error("Examples:");
    console.error("node scripts/configure-telegram-webhook.mjs");
    console.error("node scripts/configure-telegram-webhook.mjs --delete");
    process.exit(1);
  }

  if (DELETE_WEBHOOK) {
    await deleteWebhook();
  } else {
    await setWebhook();
  }

  await printWebhookInfo();
}

async function setWebhook() {
  const url = `${SITE_URL.replace(/\/$/, "")}/api/telegram/webhook`;
  const body = new URLSearchParams({
    url,
    drop_pending_updates: String(DROP_PENDING_UPDATES),
  });

  if (TELEGRAM_WEBHOOK_SECRET) {
    body.set("secret_token", TELEGRAM_WEBHOOK_SECRET);
  }

  const response = await requestTelegram("setWebhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(
      `Telegram setWebhook failed with status ${response.status}: ${formatTelegramBody(response.body)}`
    );
  }

  console.log(`Telegram webhook configured for ${url}`);
  if (TELEGRAM_WEBHOOK_SECRET) {
    console.log("Telegram webhook secret token was included in the request.");
  }
}

async function deleteWebhook() {
  const body = new URLSearchParams({
    drop_pending_updates: String(DROP_PENDING_UPDATES),
  });

  const response = await requestTelegram("deleteWebhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(
      `Telegram deleteWebhook failed with status ${response.status}: ${formatTelegramBody(response.body)}`
    );
  }

  console.log("Telegram webhook deleted.");
}

async function printWebhookInfo() {
  const response = await requestTelegram("getWebhookInfo");

  if (!response.ok) {
    throw new Error(
      `Telegram getWebhookInfo failed with status ${response.status}: ${formatTelegramBody(response.body)}`
    );
  }

  const result = response.body?.result ?? null;

  console.log("");
  console.log("Current Telegram webhook info");
  console.log(JSON.stringify(result, null, 2));
}

async function requestTelegram(method, options = {}) {
  const response = await fetch(
    `${TELEGRAM_BASE_URL}/bot${TELEGRAM_BOT_TOKEN}/${method}`,
    options
  );
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    body,
    ok: response.ok && body?.ok !== false,
    status: response.status,
  };
}

function formatTelegramBody(body) {
  if (body === null || body === undefined) {
    return "no response body";
  }

  if (typeof body === "string") {
    return body;
  }

  return JSON.stringify(body);
}

function getEnv(key) {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : "";
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});
