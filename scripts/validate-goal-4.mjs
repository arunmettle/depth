#!/usr/bin/env node

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

const SUPABASE_URL = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SECRET_KEY =
  getEnv("SUPABASE_SECRET_KEY") || getEnv("SUPABASE_SERVICE_ROLE_KEY");
const VALIDATION_REPORT_PATH = getEnv("VALIDATION_REPORT_PATH");
const VALIDATION_USER_ID = getEnv("VALIDATION_USER_ID");
const VALIDATION_EXERCISE_CRUD = getEnv("VALIDATION_EXERCISE_CRUD") === "true";
const VALIDATION_RULE_MARKET = getEnv("VALIDATION_RULE_MARKET") || "BTCUSDT";
const VALIDATION_RULE_TIMEFRAME = getEnv("VALIDATION_RULE_TIMEFRAME") || "5m";
const VALIDATION_RULE_TYPE = getEnv("VALIDATION_RULE_TYPE") || "stacked_imbalance";
const VALIDATION_RULE_STATUS = getEnv("VALIDATION_RULE_STATUS") || "active";

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

  if (missing.length) {
    for (const item of missing) {
      failures.push(`Missing ${item}`);
    }
  }

  const supabase =
    SUPABASE_URL && SUPABASE_SECRET_KEY ? await validateSupabaseAlertRules() : null;

  return {
    completedAt: new Date().toISOString(),
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
    exerciseCrud: VALIDATION_EXERCISE_CRUD,
    reportPath: VALIDATION_REPORT_PATH || null,
    supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY),
    validationRuleMarket: VALIDATION_RULE_MARKET,
    validationRuleStatus: VALIDATION_RULE_STATUS,
    validationRuleTimeframe: VALIDATION_RULE_TIMEFRAME,
    validationRuleType: VALIDATION_RULE_TYPE,
    validationUserScoped: Boolean(VALIDATION_USER_ID),
  };
}

function buildRecommendations() {
  const items = [];

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    items.push("Set SUPABASE_URL and SUPABASE_SECRET_KEY so alert-rule persistence can be validated.");
  }

  if (!VALIDATION_USER_ID) {
    items.push("Set VALIDATION_USER_ID to inspect owner-scoped alert rules and enable live CRUD validation.");
  }

  if (VALIDATION_USER_ID && !VALIDATION_EXERCISE_CRUD) {
    items.push("Set VALIDATION_EXERCISE_CRUD=true to create, update, and delete a temporary validation rule for Goal 4 signoff evidence.");
  }

  if (!items.length && warnings.length) {
    items.push("Review the warnings and resolve remaining Goal 4 readiness gaps before calling alert-rule CRUD production-ready.");
  }

  if (!items.length && !failures.length) {
    items.push("Preserve the JSON and markdown artifacts as Goal 4 alert-rule CRUD signoff evidence.");
  }

  return items;
}

async function validateSupabaseAlertRules() {
  const rules = await selectRows("alert_rules", {
    select:
      "id,user_id,name,market_symbol,timeframe,rule_type,status,destination,created_at,updated_at,params",
    limit: VALIDATION_USER_ID ? "10" : "20",
    order: "created_at.desc",
  });

  if (rules.status !== 200) {
    failures.push(`Supabase alert_rules query failed with status ${rules.status}`);
  }

  const rows = Array.isArray(rules.body) ? rules.body : [];

  if (!rows.length) {
    warnings.push(
      VALIDATION_USER_ID
        ? `No alert_rules rows found yet for VALIDATION_USER_ID=${VALIDATION_USER_ID}.`
        : "No alert_rules rows found yet. Create a real rule or run CRUD validation to finish Goal 4 signoff."
    );
  }

  let crud = null;
  if (VALIDATION_EXERCISE_CRUD) {
    if (!VALIDATION_USER_ID) {
      failures.push("VALIDATION_EXERCISE_CRUD=true requires VALIDATION_USER_ID so the temporary rule can stay owner-scoped.");
    } else {
      crud = await exerciseCrud();
    }
  }

  return {
    crud,
    latestRuleId: rows[0]?.id ?? null,
    latestRuleName: rows[0]?.name ?? null,
    latestRuleStatus: rows[0]?.status ?? null,
    latestRuleType: rows[0]?.rule_type ?? null,
    ruleRows: rows.length,
    validationUserMatched: VALIDATION_USER_ID ? rows.length > 0 : null,
  };
}

async function exerciseCrud() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ruleName = `Goal4 Validation ${timestamp}`;
  const initialParams =
    VALIDATION_RULE_TYPE === "trapped_traders"
      ? {
          minAbsorptionVolume: 250000,
          trapSide: "buyers",
        }
      : {
          confirmationRows: 3,
          thresholdMultiplier: 300,
        };
  const updatedParams =
    VALIDATION_RULE_TYPE === "trapped_traders"
      ? {
          minAbsorptionVolume: 500000,
          trapSide: "sellers",
        }
      : {
          confirmationRows: 4,
          thresholdMultiplier: 325,
        };

  const createResponse = await requestJSON(new URL("/rest/v1/alert_rules", SUPABASE_URL), {
    method: "POST",
    headers: {
      ...buildSupabaseHeaders(),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      destination: "telegram",
      market_symbol: VALIDATION_RULE_MARKET,
      name: ruleName,
      params: initialParams,
      rule_type: VALIDATION_RULE_TYPE,
      status: VALIDATION_RULE_STATUS,
      timeframe: VALIDATION_RULE_TIMEFRAME,
      user_id: VALIDATION_USER_ID,
    }),
  });

  if (![200, 201].includes(createResponse.status)) {
    failures.push(`Goal 4 CRUD create failed with status ${createResponse.status}.`);
    return {
      created: false,
      deleted: false,
      readBack: false,
      updated: false,
    };
  }

  const createdRule = Array.isArray(createResponse.body)
    ? createResponse.body[0]
    : createResponse.body;
  const ruleId = createdRule?.id ?? null;

  if (!ruleId) {
    failures.push("Goal 4 CRUD create did not return a rule id.");
    return {
      created: false,
      deleted: false,
      readBack: false,
      updated: false,
    };
  }

  const readResponse = await selectRows("alert_rules", {
    select:
      "id,user_id,name,market_symbol,timeframe,rule_type,status,destination,created_at,updated_at,params",
    id: `eq.${ruleId}`,
    limit: "1",
  });
  const readRows = Array.isArray(readResponse.body) ? readResponse.body : [];
  const readBack = readResponse.status === 200 && readRows.length === 1;

  if (!readBack) {
    failures.push(`Goal 4 CRUD read-back failed for rule ${ruleId}.`);
  }

  const updateUrl = new URL("/rest/v1/alert_rules", SUPABASE_URL);
  updateUrl.searchParams.set("id", `eq.${ruleId}`);
  updateUrl.searchParams.set("user_id", `eq.${VALIDATION_USER_ID}`);

  const updateResponse = await requestJSON(updateUrl, {
    method: "PATCH",
    headers: {
      ...buildSupabaseHeaders(),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      name: `${ruleName} Updated`,
      params: updatedParams,
      status: VALIDATION_RULE_STATUS === "active" ? "paused" : "active",
    }),
  });

  const updatedBody = Array.isArray(updateResponse.body)
    ? updateResponse.body[0]
    : updateResponse.body;
  const updated =
    updateResponse.status === 200 &&
    Boolean(updatedBody?.id) &&
    updatedBody?.name === `${ruleName} Updated`;

  if (!updated) {
    failures.push(`Goal 4 CRUD update failed for rule ${ruleId}.`);
  }

  const deleteUrl = new URL("/rest/v1/alert_rules", SUPABASE_URL);
  deleteUrl.searchParams.set("id", `eq.${ruleId}`);
  deleteUrl.searchParams.set("user_id", `eq.${VALIDATION_USER_ID}`);

  const deleteResponse = await requestJSON(deleteUrl, {
    method: "DELETE",
    headers: {
      ...buildSupabaseHeaders(),
      Prefer: "return=representation",
    },
  });

  const deleted =
    [200, 204].includes(deleteResponse.status) ||
    (Array.isArray(deleteResponse.body) && deleteResponse.body.some((row) => row?.id === ruleId));

  if (!deleted) {
    failures.push(`Goal 4 CRUD delete failed for rule ${ruleId}.`);
  }

  return {
    created: true,
    createdRuleId: ruleId,
    deleted,
    readBack,
    updated,
    validationRuleName: ruleName,
  };
}

async function selectRows(table, params) {
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  if (VALIDATION_USER_ID && !url.searchParams.has("user_id")) {
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

function printSummary(summary) {
  console.log("Goal 4 Live Validation Summary");
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
    "# Goal 4 Validation Report",
    "",
    `- Completed at: ${summary.completedAt}`,
    `- Overall status: ${summary.overallStatus}`,
    "",
    "## Run Config",
    "",
    `- Supabase configured: ${formatValue(summary.runConfig?.supabaseConfigured)}`,
    `- Validation user scoped: ${formatValue(summary.runConfig?.validationUserScoped)}`,
    `- Exercise CRUD: ${formatValue(summary.runConfig?.exerciseCrud)}`,
    `- Rule market: ${formatValue(summary.runConfig?.validationRuleMarket)}`,
    `- Rule timeframe: ${formatValue(summary.runConfig?.validationRuleTimeframe)}`,
    `- Rule type: ${formatValue(summary.runConfig?.validationRuleType)}`,
    `- Rule status: ${formatValue(summary.runConfig?.validationRuleStatus)}`,
    `- Report path: ${formatValue(summary.runConfig?.reportPath)}`,
    "",
    "## Supabase",
    "",
    `- Rule rows: ${formatValue(summary.supabase?.ruleRows)}`,
    `- Latest rule id: ${formatValue(summary.supabase?.latestRuleId)}`,
    `- Latest rule name: ${formatValue(summary.supabase?.latestRuleName)}`,
    `- Latest rule status: ${formatValue(summary.supabase?.latestRuleStatus)}`,
    `- Latest rule type: ${formatValue(summary.supabase?.latestRuleType)}`,
    `- Validation user matched: ${formatValue(summary.supabase?.validationUserMatched)}`,
    "",
    "## CRUD",
    "",
    `- Created: ${formatValue(summary.supabase?.crud?.created)}`,
    `- Created rule id: ${formatValue(summary.supabase?.crud?.createdRuleId)}`,
    `- Read back: ${formatValue(summary.supabase?.crud?.readBack)}`,
    `- Updated: ${formatValue(summary.supabase?.crud?.updated)}`,
    `- Deleted: ${formatValue(summary.supabase?.crud?.deleted)}`,
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
