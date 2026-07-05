#!/usr/bin/env node

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

const ENGINE_STATUS_URL = getEnv("ENGINE_STATUS_URL");
const VALIDATION_EXPECT_READY = getEnvBoolean("VALIDATION_EXPECT_READY", true);
const VALIDATION_EXPECT_RULE_SOURCE = getEnv("VALIDATION_EXPECT_RULE_SOURCE");
const VALIDATION_EXPECT_SYMBOLS = getEnvCSV("VALIDATION_EXPECT_SYMBOLS", ["BTCUSDT", "ETHUSDT"]);
const VALIDATION_EXPECT_TIMEFRAMES = getEnvCSV("VALIDATION_EXPECT_TIMEFRAMES", ["1m", "5m", "15m"]);
const VALIDATION_POLL_INTERVAL_MS = getEnvInt("VALIDATION_POLL_INTERVAL_MS", 1000);
const VALIDATION_POLL_TIMEOUT_MS = getEnvInt("VALIDATION_POLL_TIMEOUT_MS", 30000);
const VALIDATION_REPORT_PATH = getEnv("VALIDATION_REPORT_PATH");

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
  if (!ENGINE_STATUS_URL) {
    failures.push("Missing ENGINE_STATUS_URL");
  }

  const engine = ENGINE_STATUS_URL ? await validateEngine() : null;

  return {
    completedAt: new Date().toISOString(),
    engine,
    failures: [...failures],
    overallStatus: failures.length ? "failed" : "passed",
    recommendations: buildRecommendations(),
    runConfig: buildRunConfig(),
    warnings: [...warnings],
  };
}

function buildRunConfig() {
  return {
    engineStatusURLConfigured: Boolean(ENGINE_STATUS_URL),
    expectReady: VALIDATION_EXPECT_READY,
    expectRuleSource: VALIDATION_EXPECT_RULE_SOURCE || null,
    expectSymbols: VALIDATION_EXPECT_SYMBOLS,
    expectTimeframes: VALIDATION_EXPECT_TIMEFRAMES,
    pollIntervalMs: VALIDATION_POLL_INTERVAL_MS,
    pollTimeoutMs: VALIDATION_POLL_TIMEOUT_MS,
    reportPath: VALIDATION_REPORT_PATH || null,
  };
}

function buildRecommendations() {
  const items = [];

  if (!ENGINE_STATUS_URL) {
    items.push("Set ENGINE_STATUS_URL so the Goal 5 harness can inspect /healthz and /readyz.");
  }

  if (!VALIDATION_EXPECT_RULE_SOURCE) {
    items.push("Set VALIDATION_EXPECT_RULE_SOURCE when you want the harness to prove static or Supabase rule-source alignment.");
  }

  if (!items.length && warnings.length) {
    items.push("Review the warnings and resolve remaining engine readiness gaps before treating the run as production signoff.");
  }

  if (!items.length && !failures.length) {
    items.push("Preserve the JSON and markdown artifacts as Goal 5 engine-validation evidence.");
  }

  return items;
}

async function validateEngine() {
  const observation = await observeEngine();
  const healthPayload = observation.lastHealth?.body ?? null;
  const readyPayload = observation.lastReady?.body ?? null;
  const stream = healthPayload?.stream ?? null;

  if (observation.lastHealth?.status !== 200) {
    failures.push(`Engine health check failed with status ${observation.lastHealth?.status ?? 0}.`);
  }

  if (!stream) {
    failures.push("Engine health payload does not include stream state.");
  }

  if (VALIDATION_EXPECT_READY && observation.lastReady?.status !== 200) {
    failures.push(
      `Engine ready check did not turn green within ${VALIDATION_POLL_TIMEOUT_MS}ms. Last status ${observation.lastReady?.status ?? 0}.`
    );
  }

  evaluateCoverage(stream, readyPayload?.reason ?? null);

  return {
    candlesObserved: Array.isArray(stream?.candles) ? stream.candles.length : 0,
    connected: Boolean(stream?.connected),
    elapsedMs: observation.elapsedMs,
    fresh: Boolean(stream?.fresh),
    healthHTTPStatus: observation.lastHealth?.status ?? null,
    healthStatus: healthPayload?.status ?? null,
    lastError: stream?.lastError ?? null,
    lastMessageAt: stream?.lastMessageAt ?? null,
    messagesReceived: stream?.messagesReceived ?? null,
    readyHTTPStatus: observation.lastReady?.status ?? null,
    readyReason: readyPayload?.reason ?? null,
    readyStatus: readyPayload?.status ?? null,
    reconnectAttempts: stream?.reconnectAttempts ?? null,
    ruleSource: stream?.evaluator?.ruleSource ?? null,
    subscribedTopics: Array.isArray(stream?.subscribedTopics) ? stream.subscribedTopics : [],
    symbolCoverage: buildSymbolCoverage(stream),
    tradesNormalized: stream?.tradesNormalized ?? null,
  };
}

async function observeEngine() {
  const startedAt = Date.now();
  const deadline = startedAt + VALIDATION_POLL_TIMEOUT_MS;
  let lastHealth = null;
  let lastReady = null;

  while (Date.now() <= deadline) {
    [lastHealth, lastReady] = await Promise.all([
      requestJSON(ENGINE_STATUS_URL, {
        headers: { Accept: "application/json" },
      }),
      requestJSON(deriveReadyURL(new URL(ENGINE_STATUS_URL)), {
        headers: { Accept: "application/json" },
      }),
    ]);

    if (engineLooksReady(lastHealth?.body, lastReady?.body, lastReady?.status)) {
      return {
        elapsedMs: Date.now() - startedAt,
        lastHealth,
        lastReady,
      };
    }

    if (!VALIDATION_EXPECT_READY) {
      break
    }

    await sleep(VALIDATION_POLL_INTERVAL_MS);
  }

  return {
    elapsedMs: Date.now() - startedAt,
    lastHealth,
    lastReady,
  };
}

function engineLooksReady(healthPayload, readyPayload, readyHTTPStatus) {
  if (!VALIDATION_EXPECT_READY) {
    return true;
  }

  const stream = healthPayload?.stream;
  if (!stream || readyHTTPStatus !== 200 || readyPayload?.status !== "ready") {
    return false;
  }

  if (!stream.connected || !stream.fresh) {
    return false;
  }

  if ((stream.messagesReceived ?? 0) <= 0 || (stream.tradesNormalized ?? 0) <= 0) {
    return false;
  }

  return missingTopics(stream).length === 0 && missingSymbols(stream).length === 0 && missingCandles(stream).length === 0;
}

function evaluateCoverage(stream, readyReason) {
  if (!stream) {
    return;
  }

  const missingTopicItems = missingTopics(stream);
  if (missingTopicItems.length) {
    failures.push(`Engine stream is missing subscribed topics for: ${missingTopicItems.join(", ")}.`);
  }

  const missingSymbolItems = missingSymbols(stream);
  if (missingSymbolItems.length) {
    failures.push(`Engine stream state is missing launch symbols: ${missingSymbolItems.join(", ")}.`);
  }

  const missingCandleItems = missingCandles(stream);
  if (missingCandleItems.length) {
    failures.push(`Engine candle state is missing launch symbol/timeframe coverage: ${missingCandleItems.join(", ")}.`);
  }

  if (VALIDATION_EXPECT_RULE_SOURCE && stream.evaluator?.ruleSource !== VALIDATION_EXPECT_RULE_SOURCE) {
    failures.push(
      `Engine rule source mismatch. Expected ${VALIDATION_EXPECT_RULE_SOURCE}, got ${stream.evaluator?.ruleSource || "N/A"}.`
    );
  }

  if (VALIDATION_EXPECT_READY && !stream.connected) {
    failures.push("Engine stream is not connected.");
  }

  if (VALIDATION_EXPECT_READY && !stream.fresh) {
    failures.push(`Engine stream is not fresh. Last ready reason: ${readyReason || "N/A"}.`);
  }

  if ((stream.messagesReceived ?? 0) <= 0) {
    failures.push("Engine has not received market messages yet.");
  }

  if ((stream.tradesNormalized ?? 0) <= 0) {
    failures.push("Engine has not normalized any trades yet.");
  }

  if (!Array.isArray(stream.symbols) || stream.symbols.length === 0) {
    failures.push("Engine health payload does not include symbol state.");
  }

  if (!Array.isArray(stream.candles) || stream.candles.length === 0) {
    failures.push("Engine health payload does not include candle state.");
  }

  if (stream.evaluator?.lastRuleSyncErr) {
    warnings.push(`Engine evaluator reports last rule sync error: ${stream.evaluator.lastRuleSyncErr}`);
  }

  if (readyReason && readyReason !== "waiting-for-market-data" && readyReason !== "stream-disconnected") {
    warnings.push(`Engine ready reason at observation time: ${readyReason}`);
  }
}

function missingTopics(stream) {
  const topics = new Set(Array.isArray(stream?.subscribedTopics) ? stream.subscribedTopics : []);
  return VALIDATION_EXPECT_SYMBOLS.filter((symbol) => !topics.has(`publicTrade.${symbol}`));
}

function missingSymbols(stream) {
  const symbols = new Set(
    Array.isArray(stream?.symbols) ? stream.symbols.map((item) => item?.symbol).filter(Boolean) : []
  );
  return VALIDATION_EXPECT_SYMBOLS.filter((symbol) => !symbols.has(symbol));
}

function missingCandles(stream) {
  const present = new Set(
    Array.isArray(stream?.candles)
      ? stream.candles.map((candle) => `${candle?.symbol}:${candle?.timeframe}`).filter((value) => !value.includes("undefined"))
      : []
  );

  const missing = [];
  for (const symbol of VALIDATION_EXPECT_SYMBOLS) {
    for (const timeframe of VALIDATION_EXPECT_TIMEFRAMES) {
      const key = `${symbol}:${timeframe}`;
      if (!present.has(key)) {
        missing.push(key);
      }
    }
  }

  return missing;
}

function buildSymbolCoverage(stream) {
  const candles = Array.isArray(stream?.candles) ? stream.candles : [];

  return VALIDATION_EXPECT_SYMBOLS.map((symbol) => {
    const symbolState = Array.isArray(stream?.symbols)
      ? stream.symbols.find((item) => item?.symbol === symbol) ?? null
      : null;

    return {
      candleTimeframes: candles
        .filter((item) => item?.symbol === symbol)
        .map((item) => item?.timeframe)
        .filter(Boolean)
        .sort(),
      hasSymbolState: Boolean(symbolState),
      lastTradeAt: symbolState?.lastTradeAt ?? null,
      symbol,
      tradesNormalized: symbolState?.tradesNormalized ?? null,
    };
  });
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

async function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function printSummary(summary) {
  console.log("Goal 5 Live Validation Summary");
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
    "# Goal 5 Validation Report",
    "",
    `- Completed at: ${summary.completedAt}`,
    `- Overall status: ${summary.overallStatus}`,
    "",
    "## Run Config",
    "",
    `- Engine status URL configured: ${formatValue(summary.runConfig?.engineStatusURLConfigured)}`,
    `- Expect ready: ${formatValue(summary.runConfig?.expectReady)}`,
    `- Expected rule source: ${formatValue(summary.runConfig?.expectRuleSource)}`,
    `- Expected symbols: ${formatValue(summary.runConfig?.expectSymbols?.join(", "))}`,
    `- Expected timeframes: ${formatValue(summary.runConfig?.expectTimeframes?.join(", "))}`,
    `- Poll interval ms: ${formatValue(summary.runConfig?.pollIntervalMs)}`,
    `- Poll timeout ms: ${formatValue(summary.runConfig?.pollTimeoutMs)}`,
    `- Report path: ${formatValue(summary.runConfig?.reportPath)}`,
    "",
    "## Engine",
    "",
    `- Connected: ${formatValue(summary.engine?.connected)}`,
    `- Fresh: ${formatValue(summary.engine?.fresh)}`,
    `- Health HTTP status: ${formatValue(summary.engine?.healthHTTPStatus)}`,
    `- Health status: ${formatValue(summary.engine?.healthStatus)}`,
    `- Ready HTTP status: ${formatValue(summary.engine?.readyHTTPStatus)}`,
    `- Ready status: ${formatValue(summary.engine?.readyStatus)}`,
    `- Ready reason: ${formatValue(summary.engine?.readyReason)}`,
    `- Messages received: ${formatValue(summary.engine?.messagesReceived)}`,
    `- Trades normalized: ${formatValue(summary.engine?.tradesNormalized)}`,
    `- Candles observed: ${formatValue(summary.engine?.candlesObserved)}`,
    `- Reconnect attempts: ${formatValue(summary.engine?.reconnectAttempts)}`,
    `- Rule source: ${formatValue(summary.engine?.ruleSource)}`,
    `- Last message at: ${formatValue(summary.engine?.lastMessageAt)}`,
    `- Last error: ${formatValue(summary.engine?.lastError)}`,
    `- Elapsed ms: ${formatValue(summary.engine?.elapsedMs)}`,
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

function getEnvBoolean(key, fallback) {
  const value = getEnv(key);
  if (!value) {
    return fallback;
  }

  return value === "true";
}

function getEnvCSV(key, fallback) {
  const value = getEnv(key);
  if (!value) {
    return fallback;
  }

  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return parts.length ? parts : fallback;
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
