#!/usr/bin/env node

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

const SUPABASE_URL = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SECRET_KEY =
  getEnv("SUPABASE_SECRET_KEY") || getEnv("SUPABASE_SERVICE_ROLE_KEY");
const TELEGRAM_BOT_TOKEN = getEnv("TELEGRAM_BOT_TOKEN");
const TELEGRAM_BOT_USERNAME = getEnv("TELEGRAM_BOT_USERNAME");
const TELEGRAM_BASE_URL = getEnv("TELEGRAM_BASE_URL") || "https://api.telegram.org";
const SITE_URL = getEnv("NEXT_PUBLIC_SITE_URL");
const TELEGRAM_WEBHOOK_SECRET = getEnv("TELEGRAM_WEBHOOK_SECRET");
const VALIDATION_REPORT_PATH = getEnv("VALIDATION_REPORT_PATH");
const VALIDATION_USER_ID = getEnv("VALIDATION_USER_ID");

const failures = [];
const warnings = [];

async function main() {
  const summary = await buildSummary();

  printSummary(summary);
  await maybeWriteReport(summary);

  if (failures.length) {
    process.exit(1);
  }
}

async function buildSummary() {
  const missing = [];

  if (!SUPABASE_URL) missing.push("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_SECRET_KEY) {
    missing.push("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!TELEGRAM_BOT_TOKEN) missing.push("TELEGRAM_BOT_TOKEN");
  if (!TELEGRAM_BOT_USERNAME) missing.push("TELEGRAM_BOT_USERNAME");

  if (missing.length) {
    for (const item of missing) {
      failures.push(`Missing ${item}`);
    }
  }

  const telegram = TELEGRAM_BOT_TOKEN ? await validateTelegram() : null;
  const supabase = SUPABASE_URL && SUPABASE_SECRET_KEY ? await validateSupabase() : null;

  return {
    completedAt: new Date().toISOString(),
    failures: [...failures],
    overallStatus: failures.length ? "failed" : "passed",
    recommendations: buildRecommendations(),
    runConfig: buildRunConfig(),
    supabase,
    telegram,
    warnings: [...warnings],
  };
}

function buildRunConfig() {
  return {
    reportPath: VALIDATION_REPORT_PATH || null,
    siteURLConfigured: Boolean(SITE_URL),
    supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY),
    telegramBotConfigured: Boolean(TELEGRAM_BOT_TOKEN),
    telegramBotUsernameConfigured: Boolean(TELEGRAM_BOT_USERNAME),
    telegramWebhookSecretConfigured: Boolean(TELEGRAM_WEBHOOK_SECRET),
    validationUserScoped: Boolean(VALIDATION_USER_ID),
  };
}

function buildRecommendations() {
  const items = [];

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    items.push("Set SUPABASE_URL and SUPABASE_SECRET_KEY so Telegram connection persistence can be validated.");
  }

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_BOT_USERNAME) {
    items.push("Set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME so the pairing bot can be verified.");
  }

  if (!SITE_URL) {
    items.push("Set NEXT_PUBLIC_SITE_URL so the configured webhook URL can be compared against the expected /api/telegram/webhook endpoint.");
  }

  if (!VALIDATION_USER_ID) {
    items.push("Set VALIDATION_USER_ID after pairing a real account if you want the harness to confirm a user-scoped telegram_connections row.");
  }

  if (!items.length && warnings.length) {
    items.push("Review the warnings and resolve the remaining setup gaps before calling Goal 3 production-ready.");
  }

  if (!items.length && !failures.length) {
    items.push("Preserve the JSON and markdown artifacts as Goal 3 pairing signoff evidence.");
  }

  return items;
}

async function validateTelegram() {
  const me = await requestJSON(`${TELEGRAM_BASE_URL}/bot${TELEGRAM_BOT_TOKEN}/getMe`);
  const webhook = await requestJSON(
    `${TELEGRAM_BASE_URL}/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`
  );

  if (me.status !== 200 || !me.body?.ok) {
    failures.push("Telegram getMe failed for the configured bot token.");
  }

  if (webhook.status !== 200 || !webhook.body?.ok) {
    failures.push("Telegram getWebhookInfo failed for the configured bot token.");
  }

  const botUsername = me.body?.result?.username ?? null;
  if (botUsername && TELEGRAM_BOT_USERNAME && botUsername !== TELEGRAM_BOT_USERNAME) {
    failures.push(
      `Configured TELEGRAM_BOT_USERNAME does not match Telegram bot username. Expected ${botUsername}, got ${TELEGRAM_BOT_USERNAME}.`
    );
  }

  const expectedWebhookURL = SITE_URL
    ? `${SITE_URL.replace(/\/$/, "")}/api/telegram/webhook`
    : null;
  const actualWebhookURL = webhook.body?.result?.url || "";

  if (!actualWebhookURL) {
    warnings.push("Telegram webhook URL is empty, so Telegram pairing cannot complete yet.");
  } else if (expectedWebhookURL && actualWebhookURL !== expectedWebhookURL) {
    warnings.push(
      `Telegram webhook URL does not match NEXT_PUBLIC_SITE_URL. Expected ${expectedWebhookURL}, got ${actualWebhookURL}.`
    );
  }

  if (webhook.body?.result?.last_error_message) {
    warnings.push(
      `Telegram reported webhook delivery issues: ${webhook.body.result.last_error_message}`
    );
  }

  if (TELEGRAM_WEBHOOK_SECRET && !actualWebhookURL) {
    warnings.push("TELEGRAM_WEBHOOK_SECRET is set, but Telegram has no webhook URL configured.");
  }

  return {
    actualWebhookURL: actualWebhookURL || null,
    botUsername,
    configuredBotUsername: TELEGRAM_BOT_USERNAME || null,
    hasWebhook: Boolean(actualWebhookURL),
    lastErrorDate: webhook.body?.result?.last_error_date ?? null,
    lastErrorMessage: webhook.body?.result?.last_error_message ?? null,
    pendingUpdateCount: webhook.body?.result?.pending_update_count ?? null,
  };
}

async function validateSupabase() {
  const connections = await selectRows("telegram_connections", {
    select: "user_id,telegram_chat_id,telegram_username,connected_at,last_seen_at",
    limit: VALIDATION_USER_ID ? "1" : "10",
    order: "last_seen_at.desc",
  });

  if (connections.status !== 200) {
    failures.push(
      `Supabase telegram_connections query failed with status ${connections.status}`
    );
  }

  const rows = Array.isArray(connections.body) ? connections.body : [];

  if (!rows.length) {
    warnings.push(
      VALIDATION_USER_ID
        ? `No telegram_connections row found yet for VALIDATION_USER_ID=${VALIDATION_USER_ID}.`
        : "No telegram_connections rows found yet. Complete a live Telegram pairing to finish Goal 3 validation."
    );
  }

  return {
    latestChatId: rows[0]?.telegram_chat_id ?? null,
    latestConnectedAt: rows[0]?.connected_at ?? null,
    latestLastSeenAt: rows[0]?.last_seen_at ?? null,
    latestUsername: rows[0]?.telegram_username ?? null,
    telegramConnectionRows: rows.length,
    validationUserMatched: VALIDATION_USER_ID ? rows.length > 0 : null,
  };
}

async function selectRows(table, params) {
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  if (VALIDATION_USER_ID) {
    url.searchParams.set("user_id", `eq.${VALIDATION_USER_ID}`);
  }

  return requestJSON(url, {
    headers: {
      Accept: "application/json",
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    },
  });
}

async function requestJSON(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    return {
      body,
      status: response.status,
    };
  } catch (error) {
    failures.push(
      `Request failed for ${String(url)}: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      body: null,
      status: 0,
    };
  }
}

function printSummary(summary) {
  console.log("Goal 3 Live Validation Summary");
  console.log("");
  console.log(JSON.stringify(summary, null, 2));

  if (warnings.length) {
    console.log("");
    console.log("Warnings");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (failures.length) {
    console.log("");
    console.log("Failures");
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
  } else {
    console.log("");
    console.log("Validation checks completed without hard failures.");
  }
}

async function maybeWriteReport(summary) {
  if (!VALIDATION_REPORT_PATH) {
    return;
  }

  const output = JSON.stringify(summary, null, 2) + "\n";
  const markdownPath = deriveMarkdownReportPath(VALIDATION_REPORT_PATH);
  const latestJsonPath = deriveLatestReportPath(VALIDATION_REPORT_PATH);
  const latestMarkdownPath = deriveMarkdownReportPath(latestJsonPath);
  const markdown = buildMarkdownReport(summary);
  await mkdir(dirname(VALIDATION_REPORT_PATH), { recursive: true });
  await writeFile(VALIDATION_REPORT_PATH, output, "utf8");
  await writeFile(markdownPath, markdown, "utf8");
  await copyFile(VALIDATION_REPORT_PATH, latestJsonPath);
  await copyFile(markdownPath, latestMarkdownPath);
  console.log("");
  console.log(`Validation report written to ${VALIDATION_REPORT_PATH}`);
  console.log(`Validation summary written to ${markdownPath}`);
  console.log(`Latest JSON report updated at ${latestJsonPath}`);
  console.log(`Latest markdown report updated at ${latestMarkdownPath}`);
}

function deriveMarkdownReportPath(reportPath) {
  const extension = extname(reportPath);
  if (!extension) {
    return `${reportPath}.md`;
  }

  return reportPath.slice(0, -extension.length) + ".md";
}

function deriveLatestReportPath(reportPath) {
  const directory = dirname(reportPath);
  const extension = extname(reportPath) || ".json";
  const fileName = basename(reportPath, extension);
  const prefix = fileName.replace(/-\d{8}-\d{6}$/, "");

  return join(directory, `${prefix}-latest${extension}`);
}

function buildMarkdownReport(summary) {
  const lines = [
    "# Goal 3 Validation Report",
    "",
    `- Completed at: ${summary.completedAt}`,
    `- Overall status: ${summary.overallStatus}`,
    "",
    "## Run Config",
    "",
    `- Site URL configured: ${formatValue(summary.runConfig?.siteURLConfigured)}`,
    `- Supabase configured: ${formatValue(summary.runConfig?.supabaseConfigured)}`,
    `- Telegram bot configured: ${formatValue(summary.runConfig?.telegramBotConfigured)}`,
    `- Telegram bot username configured: ${formatValue(summary.runConfig?.telegramBotUsernameConfigured)}`,
    `- Telegram webhook secret configured: ${formatValue(summary.runConfig?.telegramWebhookSecretConfigured)}`,
    `- Validation user scoped: ${formatValue(summary.runConfig?.validationUserScoped)}`,
    `- Report path: ${formatValue(summary.runConfig?.reportPath)}`,
    "",
    "## Telegram",
    "",
    `- Bot username: ${formatValue(summary.telegram?.botUsername)}`,
    `- Configured bot username: ${formatValue(summary.telegram?.configuredBotUsername)}`,
    `- Webhook configured: ${formatValue(summary.telegram?.hasWebhook)}`,
    `- Webhook URL: ${formatValue(summary.telegram?.actualWebhookURL)}`,
    `- Pending update count: ${formatValue(summary.telegram?.pendingUpdateCount)}`,
    `- Last error message: ${formatValue(summary.telegram?.lastErrorMessage)}`,
    "",
    "## Supabase",
    "",
    `- Telegram connection rows: ${formatValue(summary.supabase?.telegramConnectionRows)}`,
    `- Latest chat id: ${formatValue(summary.supabase?.latestChatId)}`,
    `- Latest username: ${formatValue(summary.supabase?.latestUsername)}`,
    `- Latest connected at: ${formatValue(summary.supabase?.latestConnectedAt)}`,
    `- Latest last seen at: ${formatValue(summary.supabase?.latestLastSeenAt)}`,
    `- Validation user matched: ${formatValue(summary.supabase?.validationUserMatched)}`,
    "",
    "## Warnings",
    "",
    ...formatList(summary.warnings),
    "",
    "## Failures",
    "",
    ...formatList(summary.failures),
    "",
    "## Recommendations",
    "",
    ...formatList(summary.recommendations),
    "",
  ];

  return lines.join("\n");
}

function formatList(items) {
  if (!items?.length) {
    return ["- None"];
  }

  return items.map((item) => `- ${item}`);
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  return String(value);
}

function getEnv(key) {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : "";
}

main();
