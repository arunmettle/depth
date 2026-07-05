#!/usr/bin/env node

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

const ENGINE_STATUS_URL = getEnv("ENGINE_STATUS_URL");
const SUPABASE_URL = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SECRET_KEY =
  getEnv("SUPABASE_SECRET_KEY") || getEnv("SUPABASE_SERVICE_ROLE_KEY");
const TELEGRAM_BOT_TOKEN = getEnv("TELEGRAM_BOT_TOKEN");
const TELEGRAM_BASE_URL = getEnv("TELEGRAM_BASE_URL") || "https://api.telegram.org";
const SITE_URL = getEnv("NEXT_PUBLIC_SITE_URL");
const TELEGRAM_WEBHOOK_SECRET = getEnv("TELEGRAM_WEBHOOK_SECRET");
const VALIDATION_API_KEY = getEnv("VALIDATION_API_KEY");
const VALIDATION_TRIGGER_ALERT = getEnv("VALIDATION_TRIGGER_ALERT") === "true";
const VALIDATION_TRIGGER_MARKET = getEnv("VALIDATION_TRIGGER_MARKET") || "BTCUSDT";
const VALIDATION_TRIGGER_SIDE = getEnv("VALIDATION_TRIGGER_SIDE") || "buy";
const VALIDATION_TRIGGER_TIMEFRAME = getEnv("VALIDATION_TRIGGER_TIMEFRAME") || "1m";
const VALIDATION_POLL_INTERVAL_MS = getEnvInt("VALIDATION_POLL_INTERVAL_MS", 1000);
const VALIDATION_POLL_TIMEOUT_MS = getEnvInt("VALIDATION_POLL_TIMEOUT_MS", 20000);
const VALIDATION_REPORT_PATH = getEnv("VALIDATION_REPORT_PATH");
const VALIDATION_USER_ID = getEnv("VALIDATION_USER_ID");

const failures = [];
const warnings = [];

async function main() {
  const missing = [];

  if (!ENGINE_STATUS_URL) missing.push("ENGINE_STATUS_URL");
  if (!SUPABASE_URL) missing.push("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_SECRET_KEY) missing.push("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
  if (!TELEGRAM_BOT_TOKEN) missing.push("TELEGRAM_BOT_TOKEN");

  if (missing.length) {
    for (const item of missing) {
      failures.push(`Missing ${item}`);
    }

    const summary = buildSummary({
      engine: null,
      supabase: null,
      telegram: null,
      triggeredAlert: null,
    });

    await maybeWriteReport(summary);

    console.error("Goal 8 validation is not configured.");
    for (const item of missing) {
      console.error(`- Missing ${item}`);
    }
    console.error("");
    console.error("Set the required environment variables, then rerun:");
    console.error("node scripts/validate-goal-8.mjs");
    process.exit(1);
  }

  let triggeredAlert = null;
  if (VALIDATION_TRIGGER_ALERT) {
    triggeredAlert = await triggerValidationAlert();
    if (triggeredAlert?.alertId) {
      triggeredAlert.observation = await waitForTriggeredAlert(triggeredAlert.alertId);
    }
  }

  const summary = buildSummary({
    engine: await validateEngine(),
    supabase: await validateSupabase(),
    telegram: await validateTelegram(),
    triggeredAlert,
  });

  printSummary(summary);
  await maybeWriteReport(summary);

  if (failures.length) {
    process.exit(1);
  }
}

function buildSummary({
  engine,
  supabase,
  telegram,
  triggeredAlert,
}) {
  return {
    completedAt: new Date().toISOString(),
    engine,
    failures: [...failures],
    overallStatus: failures.length ? "failed" : "passed",
    recommendations: buildRecommendations(),
    runConfig: buildRunConfig(),
    supabase,
    telegram,
    triggeredAlert,
    warnings: [...warnings],
  };
}

function buildRunConfig() {
  return {
    engineStatusURLConfigured: Boolean(ENGINE_STATUS_URL),
    reportPath: VALIDATION_REPORT_PATH || null,
    siteURLConfigured: Boolean(SITE_URL),
    supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY),
    telegramBotConfigured: Boolean(TELEGRAM_BOT_TOKEN),
    telegramWebhookSecretConfigured: Boolean(TELEGRAM_WEBHOOK_SECRET),
    triggerAlert: VALIDATION_TRIGGER_ALERT,
    triggerMarket: VALIDATION_TRIGGER_MARKET,
    triggerSide: VALIDATION_TRIGGER_SIDE,
    triggerTimeframe: VALIDATION_TRIGGER_TIMEFRAME,
    validationAPIKeyConfigured: Boolean(VALIDATION_API_KEY),
    validationPollIntervalMs: VALIDATION_POLL_INTERVAL_MS,
    validationPollTimeoutMs: VALIDATION_POLL_TIMEOUT_MS,
    validationUserScoped: Boolean(VALIDATION_USER_ID),
  };
}

function buildRecommendations() {
  const items = [];

  if (!ENGINE_STATUS_URL) {
    items.push("Set ENGINE_STATUS_URL so the harness can verify engine health and delivery observability.");
  }

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    items.push("Set SUPABASE_URL and SUPABASE_SECRET_KEY so persisted alert history can be validated.");
  }

  if (!TELEGRAM_BOT_TOKEN) {
    items.push("Set TELEGRAM_BOT_TOKEN so Telegram delivery and bot health can be verified.");
  }

  if (VALIDATION_TRIGGER_ALERT && !VALIDATION_API_KEY) {
    items.push("Set VALIDATION_API_KEY when VALIDATION_TRIGGER_ALERT=true so the guarded trigger endpoint can be called.");
  }

  if (VALIDATION_TRIGGER_ALERT && !VALIDATION_USER_ID) {
    items.push("Set VALIDATION_USER_ID when VALIDATION_TRIGGER_ALERT=true so the triggered alert can be tied to a real user and persisted history query.");
  }

  if (!items.length && warnings.length) {
    items.push("Review the warning section and resolve any remaining readiness gaps before treating the run as launch evidence.");
  }

  if (!items.length && !failures.length) {
    items.push("Preserve the JSON and markdown artifacts as Goal 8 signoff evidence for launch review.");
  }

  return items;
}

async function validateEngine() {
  const healthUrl = new URL(ENGINE_STATUS_URL);
  const readyUrl = deriveReadyURL(healthUrl);
  const health = await requestEngineHealth();
  const ready = await requestJSON(readyUrl, {
    headers: { Accept: "application/json" },
  });

  const stream = health.body?.stream;
  const delivery = stream?.delivery;
  if (health.status !== 200) {
    failures.push(`Engine health check failed with status ${health.status}`);
  }

  if (!stream?.evaluator || !Array.isArray(stream.evaluator.recentAlerts)) {
    failures.push("Engine health payload does not expose stream.evaluator.recentAlerts");
  }

  if (
    !delivery ||
    typeof delivery.dispatchAttempts !== "number" ||
    typeof delivery.retryAttempts !== "number" ||
    typeof delivery.persistedWrites !== "number"
  ) {
    failures.push(
      "Engine health payload does not expose the expected delivery observability fields."
    );
  }

  if (ready.status !== 200) {
    warnings.push(`Engine ready check is not green yet (status ${ready.status}).`);
  }

  return {
    connected: Boolean(stream?.connected),
    dispatchAttempts: delivery?.dispatchAttempts ?? null,
    healthStatus: health.body?.status ?? null,
    lastDeliveryStatus: delivery?.lastDeliveryStatus ?? null,
    persistedWrites: delivery?.persistedWrites ?? null,
    readyStatus: ready.body?.status ?? null,
    recentAlerts: Array.isArray(stream?.evaluator?.recentAlerts)
      ? stream.evaluator.recentAlerts.length
      : 0,
    retryAttempts: delivery?.retryAttempts ?? null,
    ruleSource: stream?.evaluator?.ruleSource ?? null,
  };
}

async function validateSupabase() {
  const rules = await selectRows("alert_rules", {
    select: "id,user_id,status,market_symbol,timeframe,rule_type",
    limit: "5",
  });
  const connections = await selectRows("telegram_connections", {
    select: "user_id,telegram_chat_id,telegram_username,last_seen_at",
    limit: "5",
  });
  const history = await selectRows("alert_history", {
    select:
      "id,user_id,created_at,delivery_status,market_symbol,rule_name,proof_content_hash,proof_media_type",
    limit: "10",
    order: "created_at.desc",
  });

  if (rules.status !== 200) {
    failures.push(`Supabase alert_rules query failed with status ${rules.status}`);
  }

  if (connections.status !== 200) {
    failures.push(
      `Supabase telegram_connections query failed with status ${connections.status}`
    );
  }

  if (history.status !== 200) {
    failures.push(`Supabase alert_history query failed with status ${history.status}`);
  }

  const historyRows = Array.isArray(history.body) ? history.body : [];
  const filteredHistory = VALIDATION_USER_ID
    ? historyRows.filter((row) => row.user_id === VALIDATION_USER_ID)
    : historyRows;

  if (!filteredHistory.length) {
    warnings.push(
      VALIDATION_USER_ID
        ? `No alert_history rows found yet for VALIDATION_USER_ID=${VALIDATION_USER_ID}.`
        : "No alert_history rows found yet. Trigger a live alert to complete Goal 8 validation."
    );
  } else {
    const latest = filteredHistory[0];
    if (!latest.proof_content_hash || !latest.proof_media_type) {
      failures.push("Latest alert_history row is missing proof metadata.");
    }
  }

  return {
    alertHistoryRows: filteredHistory.length,
    latestAlertStatus: filteredHistory[0]?.delivery_status ?? null,
    latestAlertId: filteredHistory[0]?.id ?? null,
    ruleRows: Array.isArray(rules.body) ? rules.body.length : 0,
    telegramConnectionRows: Array.isArray(connections.body) ? connections.body.length : 0,
  };
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

  const expectedWebhookURL = SITE_URL ? `${SITE_URL.replace(/\/$/, "")}/api/telegram/webhook` : null;
  const actualWebhookURL = webhook.body?.result?.url || "";

  if (!actualWebhookURL) {
    warnings.push("Telegram webhook URL is empty. Delivery can still work for engine sends, but pairing validation is incomplete.");
  } else if (expectedWebhookURL && actualWebhookURL !== expectedWebhookURL) {
    warnings.push(
      `Telegram webhook URL does not match NEXT_PUBLIC_SITE_URL. Expected ${expectedWebhookURL}, got ${actualWebhookURL}.`
    );
  }

  const secretConfigured = Boolean(TELEGRAM_WEBHOOK_SECRET);
  const maxConnections = webhook.body?.result?.max_connections ?? null;

  if (secretConfigured && !actualWebhookURL) {
    warnings.push("TELEGRAM_WEBHOOK_SECRET is set, but Telegram has no webhook URL configured.");
  }

  return {
    botUsername: me.body?.result?.username ?? null,
    hasWebhook: Boolean(actualWebhookURL),
    maxConnections,
    pendingUpdateCount: webhook.body?.result?.pending_update_count ?? null,
  };
}

async function triggerValidationAlert() {
  if (!VALIDATION_API_KEY) {
    failures.push(
      "VALIDATION_TRIGGER_ALERT=true requires VALIDATION_API_KEY so the engine validation endpoint can be called."
    );
    return null;
  }

  if (!VALIDATION_USER_ID) {
    failures.push(
      "VALIDATION_TRIGGER_ALERT=true requires VALIDATION_USER_ID so the validation alert can be tied to a real user."
    );
    return null;
  }

  const triggerUrl = deriveValidationTriggerURL(new URL(ENGINE_STATUS_URL));
  const response = await requestJSON(triggerUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-validation-key": VALIDATION_API_KEY,
    },
    body: JSON.stringify({
      marketSymbol: VALIDATION_TRIGGER_MARKET,
      side: VALIDATION_TRIGGER_SIDE,
      timeframe: VALIDATION_TRIGGER_TIMEFRAME,
      userId: VALIDATION_USER_ID,
    }),
  });

  if (response.status !== 202) {
    failures.push(
      `Validation alert trigger failed with status ${response.status}.`
    );
  }

  return {
    alertId: response.body?.alertId ?? null,
    deliveryStatus: response.body?.deliveryStatus ?? null,
    status: response.status,
  };
}

async function waitForTriggeredAlert(alertId) {
  const startedAt = Date.now();
  const deadline = startedAt + VALIDATION_POLL_TIMEOUT_MS;

  while (Date.now() <= deadline) {
    const [engine, history] = await Promise.all([
      requestEngineHealth(),
      selectRows("alert_history", {
        select:
          "id,user_id,created_at,delivery_status,market_symbol,rule_name,proof_content_hash,proof_media_type",
        id: `eq.${alertId}`,
        limit: "1",
      }),
    ]);

    const recentAlerts = engine.body?.stream?.evaluator?.recentAlerts;
    const engineMatch = Array.isArray(recentAlerts)
      ? recentAlerts.find((item) => item.id === alertId) ?? null
      : null;

    const historyRows = Array.isArray(history.body) ? history.body : [];
    const historyMatch = historyRows.find((item) => item.id === alertId) ?? null;

    if (engineMatch && historyMatch) {
      return {
        elapsedMs: Date.now() - startedAt,
        engineObserved: true,
        historyObserved: true,
        historyStatus: historyMatch.delivery_status ?? null,
      };
    }

    await sleep(VALIDATION_POLL_INTERVAL_MS);
  }

  failures.push(
    `Triggered alert ${alertId} was not fully observed in engine status and Supabase history within ${VALIDATION_POLL_TIMEOUT_MS}ms.`
  );

  return {
    elapsedMs: Date.now() - startedAt,
    engineObserved: false,
    historyObserved: false,
    historyStatus: null,
  };
}

function deriveReadyURL(healthURL) {
  const readyURL = new URL(healthURL.toString());
  if (readyURL.pathname.endsWith("/healthz")) {
    readyURL.pathname = readyURL.pathname.replace(/\/healthz$/, "/readyz");
  } else {
    readyURL.pathname = "/readyz";
  }
  return readyURL;
}

function deriveValidationTriggerURL(healthURL) {
  const triggerURL = new URL(healthURL.toString());
  triggerURL.pathname = "/internal/validate/alert";
  triggerURL.search = "";
  return triggerURL;
}

async function requestEngineHealth() {
  return requestJSON(ENGINE_STATUS_URL, {
    headers: { Accept: "application/json" },
  });
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
    headers: buildSupabaseHeaders(),
  });
}

function buildSupabaseHeaders() {
  return {
    Accept: "application/json",
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
  };
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
    failures.push(`Request failed for ${String(url)}: ${error instanceof Error ? error.message : String(error)}`);
    return {
      body: null,
      status: 0,
    };
  }
}

async function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function printSummary(summary) {
  console.log("Goal 8 Live Validation Summary");
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
    "# Goal 8 Validation Report",
    "",
    `- Completed at: ${summary.completedAt}`,
    `- Overall status: ${summary.overallStatus}`,
    "",
    "## Run Config",
    "",
    `- Engine status URL configured: ${formatValue(summary.runConfig?.engineStatusURLConfigured)}`,
    `- Supabase configured: ${formatValue(summary.runConfig?.supabaseConfigured)}`,
    `- Telegram bot configured: ${formatValue(summary.runConfig?.telegramBotConfigured)}`,
    `- Trigger alert: ${formatValue(summary.runConfig?.triggerAlert)}`,
    `- Validation API key configured: ${formatValue(summary.runConfig?.validationAPIKeyConfigured)}`,
    `- Validation user scoped: ${formatValue(summary.runConfig?.validationUserScoped)}`,
    `- Poll interval ms: ${formatValue(summary.runConfig?.validationPollIntervalMs)}`,
    `- Poll timeout ms: ${formatValue(summary.runConfig?.validationPollTimeoutMs)}`,
    `- Report path: ${formatValue(summary.runConfig?.reportPath)}`,
    "",
    "## Engine",
    "",
    `- Connected: ${formatValue(summary.engine?.connected)}`,
    `- Health status: ${formatValue(summary.engine?.healthStatus)}`,
    `- Ready status: ${formatValue(summary.engine?.readyStatus)}`,
    `- Dispatch attempts: ${formatValue(summary.engine?.dispatchAttempts)}`,
    `- Retry attempts: ${formatValue(summary.engine?.retryAttempts)}`,
    `- Persisted writes: ${formatValue(summary.engine?.persistedWrites)}`,
    `- Last delivery status: ${formatValue(summary.engine?.lastDeliveryStatus)}`,
    "",
    "## Telegram",
    "",
    `- Bot username: ${formatValue(summary.telegram?.botUsername)}`,
    `- Webhook configured: ${formatValue(summary.telegram?.hasWebhook)}`,
    `- Pending update count: ${formatValue(summary.telegram?.pendingUpdateCount)}`,
    "",
    "## Supabase",
    "",
    `- Alert history rows: ${formatValue(summary.supabase?.alertHistoryRows)}`,
    `- Latest alert id: ${formatValue(summary.supabase?.latestAlertId)}`,
    `- Latest alert status: ${formatValue(summary.supabase?.latestAlertStatus)}`,
    `- Telegram connection rows: ${formatValue(summary.supabase?.telegramConnectionRows)}`,
    `- Rule rows: ${formatValue(summary.supabase?.ruleRows)}`,
    "",
    "## Triggered Alert",
    "",
    `- Alert id: ${formatValue(summary.triggeredAlert?.alertId)}`,
    `- Initial delivery status: ${formatValue(summary.triggeredAlert?.deliveryStatus)}`,
    `- Engine observed: ${formatValue(summary.triggeredAlert?.observation?.engineObserved)}`,
    `- History observed: ${formatValue(summary.triggeredAlert?.observation?.historyObserved)}`,
    `- Observation elapsed ms: ${formatValue(summary.triggeredAlert?.observation?.elapsedMs)}`,
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

function getEnvInt(key, fallback) {
  const value = getEnv(key);
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

main();
