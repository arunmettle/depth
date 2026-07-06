#!/usr/bin/env node

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

const ENGINE_STATUS_URL = getEnv("ENGINE_STATUS_URL");
const SUPABASE_URL = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SECRET_KEY =
  getEnv("SUPABASE_SECRET_KEY") || getEnv("SUPABASE_SERVICE_ROLE_KEY");
const VALIDATION_EXPECT_READY = getEnvBoolean("VALIDATION_EXPECT_READY", true);
const VALIDATION_EXPECT_RULE_SOURCE = getEnv("VALIDATION_EXPECT_RULE_SOURCE") || "supabase-alert-rules";
const VALIDATION_EXPECT_SYMBOLS = getEnvCSV("VALIDATION_EXPECT_SYMBOLS", ["BTCUSDT", "ETHUSDT"]);
const VALIDATION_EXPECT_TIMEFRAMES = getEnvCSV("VALIDATION_EXPECT_TIMEFRAMES", ["1m", "5m", "15m"]);
const VALIDATION_POLL_INTERVAL_MS = getEnvInt("VALIDATION_POLL_INTERVAL_MS", 1000);
const VALIDATION_POLL_TIMEOUT_MS = getEnvInt("VALIDATION_POLL_TIMEOUT_MS", 30000);
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
  if (!ENGINE_STATUS_URL) {
    failures.push("Missing ENGINE_STATUS_URL");
  }

  if (!SUPABASE_URL) {
    failures.push("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!SUPABASE_SECRET_KEY) {
    failures.push("Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
  }

  const [engine, supabase] = await Promise.all([
    ENGINE_STATUS_URL ? validateEngine() : null,
    SUPABASE_URL && SUPABASE_SECRET_KEY ? validateSupabaseRules() : null,
  ]);

  compareEngineAndSupabase(engine, supabase);

  return {
    completedAt: new Date().toISOString(),
    engine,
    failures: [...failures],
    overallStatus: failures.length ? "failed" : "passed",
    recommendations: buildRecommendations(),
    runConfig: buildRunConfig(),
    supabase,
    warnings: [...warnings],
  };
}

function buildRunConfig() {
  return {
    engineStatusURLConfigured: Boolean(ENGINE_STATUS_URL),
    expectReady: VALIDATION_EXPECT_READY,
    expectRuleSource: VALIDATION_EXPECT_RULE_SOURCE,
    expectSymbols: VALIDATION_EXPECT_SYMBOLS,
    expectTimeframes: VALIDATION_EXPECT_TIMEFRAMES,
    pollIntervalMs: VALIDATION_POLL_INTERVAL_MS,
    pollTimeoutMs: VALIDATION_POLL_TIMEOUT_MS,
    reportPath: VALIDATION_REPORT_PATH || null,
    supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY),
    validationUserScoped: Boolean(VALIDATION_USER_ID),
  };
}

function buildRecommendations() {
  const items = [];

  if (!ENGINE_STATUS_URL) {
    items.push("Set ENGINE_STATUS_URL so the Goal 6 harness can verify live engine sync state.");
  }

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    items.push("Set SUPABASE_URL and SUPABASE_SECRET_KEY so persisted alert_rules can be compared with engine sync state.");
  }

  if (!VALIDATION_USER_ID) {
    items.push("Set VALIDATION_USER_ID when you want the harness to prove user-scoped persisted rules instead of project-wide active rules.");
  }

  if (!items.length && warnings.length) {
    items.push("Review the warnings and resolve remaining persisted-rule sync gaps before treating Goal 6 as production-ready.");
  }

  if (!items.length && !failures.length) {
    items.push("Preserve the JSON and markdown artifacts as Goal 6 persisted-rule sync signoff evidence.");
  }

  return items;
}

async function validateEngine() {
  const observation = await observeEngine();
  const healthPayload = observation.lastHealth?.body ?? null;
  const readyPayload = observation.lastReady?.body ?? null;
  const stream = healthPayload?.stream ?? null;
  const evaluator = stream?.evaluator ?? null;

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

  if (evaluator?.ruleSource !== VALIDATION_EXPECT_RULE_SOURCE) {
    failures.push(
      `Engine rule source mismatch. Expected ${VALIDATION_EXPECT_RULE_SOURCE}, got ${evaluator?.ruleSource || "N/A"}.`
    );
  }

  if (!evaluator?.lastRuleSyncAt) {
    failures.push("Engine evaluator does not report a successful rule sync time.");
  }

  if (evaluator?.lastRuleSyncErr) {
    failures.push(`Engine evaluator reports a rule sync error: ${evaluator.lastRuleSyncErr}`);
  }

  return {
    configuredRules: evaluator?.configuredRules ?? null,
    connected: Boolean(stream?.connected),
    elapsedMs: observation.elapsedMs,
    fresh: Boolean(stream?.fresh),
    healthHTTPStatus: observation.lastHealth?.status ?? null,
    lastRuleSyncAt: evaluator?.lastRuleSyncAt ?? null,
    lastRuleSyncErr: evaluator?.lastRuleSyncErr ?? null,
    readyHTTPStatus: observation.lastReady?.status ?? null,
    readyReason: readyPayload?.reason ?? null,
    readyStatus: readyPayload?.status ?? null,
    ruleSource: evaluator?.ruleSource ?? null,
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

    const evaluator = lastHealth?.body?.stream?.evaluator;
    const looksReady =
      lastHealth?.status === 200 &&
      evaluator?.ruleSource === VALIDATION_EXPECT_RULE_SOURCE &&
      evaluator?.lastRuleSyncAt &&
      !evaluator?.lastRuleSyncErr &&
      (!VALIDATION_EXPECT_READY || lastReady?.status === 200);

    if (looksReady) {
      return {
        elapsedMs: Date.now() - startedAt,
        lastHealth,
        lastReady,
      };
    }

    if (!VALIDATION_EXPECT_READY) {
      break;
    }

    await sleep(VALIDATION_POLL_INTERVAL_MS);
  }

  return {
    elapsedMs: Date.now() - startedAt,
    lastHealth,
    lastReady,
  };
}

async function validateSupabaseRules() {
  const query = {
    select: "id,user_id,name,market_symbol,timeframe,rule_type,status,params",
    status: "eq.active",
    rule_type: "eq.stacked_imbalance",
    order: "created_at.desc",
  };

  if (VALIDATION_EXPECT_SYMBOLS.length) {
    query.market_symbol = `in.(${VALIDATION_EXPECT_SYMBOLS.join(",")})`;
  }

  const response = await selectRows("alert_rules", query);
  if (response.status !== 200) {
    failures.push(`Supabase alert_rules query failed with status ${response.status}.`);
  }

  const rows = Array.isArray(response.body) ? response.body : [];
  const filteredRows = rows.filter((row) => VALIDATION_EXPECT_TIMEFRAMES.includes(row?.timeframe));

  if (!filteredRows.length) {
    warnings.push(
      VALIDATION_USER_ID
        ? `No active stacked_imbalance alert_rules found for VALIDATION_USER_ID=${VALIDATION_USER_ID}.`
        : "No active stacked_imbalance alert_rules found for the configured launch scope."
    );
  }

  const invalidRows = filteredRows.filter((row) => !isValidRuleRow(row));
  if (invalidRows.length) {
    failures.push(`Supabase returned ${invalidRows.length} persisted rules that do not satisfy the engine launch contract.`);
  }

  return {
    activeRows: filteredRows.length,
    invalidRows: invalidRows.length,
    latestRuleId: filteredRows[0]?.id ?? null,
    latestRuleName: filteredRows[0]?.name ?? null,
    validationUserMatched: VALIDATION_USER_ID ? filteredRows.length > 0 : null,
  };
}

function compareEngineAndSupabase(engine, supabase) {
  if (!engine || !supabase) {
    return;
  }

  if (supabase.invalidRows > 0) {
    return;
  }

  if (engine.configuredRules !== supabase.activeRows) {
    failures.push(
      `Engine configured rule count ${engine.configuredRules ?? "N/A"} does not match Supabase active persisted-rule count ${supabase.activeRows}.`
    );
  }
}

function isValidRuleRow(row) {
  return Boolean(
    row?.id &&
      row?.user_id &&
      row?.name &&
      row?.market_symbol &&
      row?.timeframe &&
      row?.rule_type === "stacked_imbalance" &&
      row?.status === "active" &&
      Number(row?.params?.confirmationRows) > 0 &&
      Number(row?.params?.thresholdMultiplier) > 0
  );
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
  console.log("Goal 6 Live Validation Summary");
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
    "# Goal 6 Validation Report",
    "",
    `- Completed at: ${summary.completedAt}`,
    `- Overall status: ${summary.overallStatus}`,
    "",
    "## Run Config",
    "",
    `- Engine status URL configured: ${formatValue(summary.runConfig?.engineStatusURLConfigured)}`,
    `- Supabase configured: ${formatValue(summary.runConfig?.supabaseConfigured)}`,
    `- Expect ready: ${formatValue(summary.runConfig?.expectReady)}`,
    `- Expected rule source: ${formatValue(summary.runConfig?.expectRuleSource)}`,
    `- Validation user scoped: ${formatValue(summary.runConfig?.validationUserScoped)}`,
    `- Expected symbols: ${formatValue(summary.runConfig?.expectSymbols?.join(", "))}`,
    `- Expected timeframes: ${formatValue(summary.runConfig?.expectTimeframes?.join(", "))}`,
    `- Poll interval ms: ${formatValue(summary.runConfig?.pollIntervalMs)}`,
    `- Poll timeout ms: ${formatValue(summary.runConfig?.pollTimeoutMs)}`,
    `- Report path: ${formatValue(summary.runConfig?.reportPath)}`,
    "",
    "## Engine",
    "",
    `- Rule source: ${formatValue(summary.engine?.ruleSource)}`,
    `- Configured rules: ${formatValue(summary.engine?.configuredRules)}`,
    `- Last rule sync at: ${formatValue(summary.engine?.lastRuleSyncAt)}`,
    `- Last rule sync error: ${formatValue(summary.engine?.lastRuleSyncErr)}`,
    `- Ready status: ${formatValue(summary.engine?.readyStatus)}`,
    `- Ready reason: ${formatValue(summary.engine?.readyReason)}`,
    "",
    "## Supabase",
    "",
    `- Active rows: ${formatValue(summary.supabase?.activeRows)}`,
    `- Invalid rows: ${formatValue(summary.supabase?.invalidRows)}`,
    `- Latest rule id: ${formatValue(summary.supabase?.latestRuleId)}`,
    `- Latest rule name: ${formatValue(summary.supabase?.latestRuleName)}`,
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
