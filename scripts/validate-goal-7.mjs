#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

const ENGINE_STATUS_URL = getEnv("ENGINE_STATUS_URL");
const SUPABASE_URL = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SECRET_KEY =
  getEnv("SUPABASE_SECRET_KEY") || getEnv("SUPABASE_SERVICE_ROLE_KEY");
const VALIDATION_REPORT_PATH = getEnv("VALIDATION_REPORT_PATH");
const VALIDATION_EXPECT_MEDIA_TYPES = getEnvCSV("VALIDATION_EXPECT_MEDIA_TYPES", [
  "image/svg+xml",
  "image/png",
]);
const VALIDATION_EXPECT_WIDTH = getEnvInt("VALIDATION_EXPECT_WIDTH", 720);
const VALIDATION_EXPECT_HEIGHT = getEnvInt("VALIDATION_EXPECT_HEIGHT", 960);
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

  const [engine, supabase] = await Promise.all([
    ENGINE_STATUS_URL ? validateEngineProof() : null,
    SUPABASE_URL && SUPABASE_SECRET_KEY ? validatePersistedProof() : null,
  ]);

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
    expectHeight: VALIDATION_EXPECT_HEIGHT,
    expectMediaTypes: VALIDATION_EXPECT_MEDIA_TYPES,
    expectWidth: VALIDATION_EXPECT_WIDTH,
    reportPath: VALIDATION_REPORT_PATH || null,
    supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY),
    validationUserScoped: Boolean(VALIDATION_USER_ID),
  };
}

function buildRecommendations() {
  const items = [];

  if (!ENGINE_STATUS_URL) {
    items.push("Set ENGINE_STATUS_URL so the Goal 7 harness can inspect proof artifacts from live engine status.");
  }

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    items.push("Set SUPABASE_URL and SUPABASE_SECRET_KEY so persisted proof artifacts can be checked in alert_history.");
  }

  if (!VALIDATION_USER_ID) {
    items.push("Set VALIDATION_USER_ID when you want persisted proof validation scoped to one real trader.");
  }

  if (!items.length && warnings.length) {
    items.push("Review the warnings and resolve remaining proof contract gaps before treating Goal 7 as production-ready.");
  }

  if (!items.length && !failures.length) {
    items.push("Preserve the JSON and markdown artifacts as Goal 7 proof contract signoff evidence.");
  }

  return items;
}

async function validateEngineProof() {
  const response = await requestJSON(ENGINE_STATUS_URL, {
    headers: { Accept: "application/json" },
  });

  if (response.status !== 200) {
    failures.push(`Engine health check failed with status ${response.status}.`);
  }

  const alerts = response.body?.stream?.evaluator?.recentAlerts;
  if (!Array.isArray(alerts)) {
    failures.push("Engine health payload does not expose stream.evaluator.recentAlerts.");
    return {
      recentAlerts: 0,
      validProofs: 0,
    };
  }

  if (!alerts.length) {
    warnings.push("Engine status has no recentAlerts yet, so live proof contract coverage is still waiting on a real evaluation.");
  }

  let validProofs = 0;
  for (const alert of alerts) {
    if (validateProofArtifact(alert?.proof, `engine recentAlert ${alert?.id || "unknown"}`)) {
      validProofs++
    }
  }

  return {
    latestAlertId: alerts[0]?.id ?? null,
    latestMediaType: alerts[0]?.proof?.mediaType ?? null,
    recentAlerts: alerts.length,
    validProofs,
  };
}

async function validatePersistedProof() {
  const response = await selectRows("alert_history", {
    select:
      "id,user_id,proof_content,proof_content_hash,proof_height,proof_media_type,proof_width,created_at",
    order: "created_at.desc",
    limit: "10",
  });

  if (response.status !== 200) {
    failures.push(`Supabase alert_history query failed with status ${response.status}.`);
  }

  const rows = Array.isArray(response.body) ? response.body : [];
  if (!rows.length) {
    warnings.push(
      VALIDATION_USER_ID
        ? `No alert_history rows found yet for VALIDATION_USER_ID=${VALIDATION_USER_ID}.`
        : "No alert_history rows found yet, so persisted proof contract validation is waiting on a real alert."
    );
  }

  let validProofs = 0;
  for (const row of rows) {
    const proof = {
      content: row?.proof_content,
      contentHash: row?.proof_content_hash,
      height: row?.proof_height,
      mediaType: row?.proof_media_type,
      width: row?.proof_width,
    };

    if (validateProofArtifact(proof, `persisted alert_history ${row?.id || "unknown"}`)) {
      validProofs++
    }
  }

  return {
    latestAlertId: rows[0]?.id ?? null,
    latestMediaType: rows[0]?.proof_media_type ?? null,
    persistedAlerts: rows.length,
    validProofs,
  };
}

function validateProofArtifact(proof, label) {
  if (!proof) {
    failures.push(`${label} is missing proof metadata.`);
    return false;
  }

  if (!proof.content || typeof proof.content !== "string") {
    failures.push(`${label} is missing proof content.`);
    return false;
  }

  if (!proof.content.includes("<svg")) {
    failures.push(`${label} proof content does not look like an SVG artifact.`);
  }

  if (!VALIDATION_EXPECT_MEDIA_TYPES.includes(proof.mediaType)) {
    failures.push(`${label} uses unsupported proof media type ${proof.mediaType || "N/A"}.`);
  }

  if (proof.width !== VALIDATION_EXPECT_WIDTH || proof.height !== VALIDATION_EXPECT_HEIGHT) {
    failures.push(
      `${label} dimensions ${proof.width || "N/A"}x${proof.height || "N/A"} do not match expected ${VALIDATION_EXPECT_WIDTH}x${VALIDATION_EXPECT_HEIGHT}.`
    );
  }

  const computedHash = createHash("sha256").update(proof.content).digest("hex");
  if (proof.contentHash !== computedHash) {
    failures.push(`${label} proof content hash does not match the proof content.`);
  }

  return (
    Boolean(proof.content) &&
    VALIDATION_EXPECT_MEDIA_TYPES.includes(proof.mediaType) &&
    proof.width === VALIDATION_EXPECT_WIDTH &&
    proof.height === VALIDATION_EXPECT_HEIGHT &&
    proof.contentHash === computedHash
  );
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

function printSummary(summary) {
  console.log("Goal 7 Live Validation Summary");
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
    "# Goal 7 Validation Report",
    "",
    `- Completed at: ${summary.completedAt}`,
    `- Overall status: ${summary.overallStatus}`,
    "",
    "## Run Config",
    "",
    `- Engine status URL configured: ${formatValue(summary.runConfig?.engineStatusURLConfigured)}`,
    `- Supabase configured: ${formatValue(summary.runConfig?.supabaseConfigured)}`,
    `- Validation user scoped: ${formatValue(summary.runConfig?.validationUserScoped)}`,
    `- Expected media types: ${formatValue(summary.runConfig?.expectMediaTypes?.join(", "))}`,
    `- Expected width: ${formatValue(summary.runConfig?.expectWidth)}`,
    `- Expected height: ${formatValue(summary.runConfig?.expectHeight)}`,
    `- Report path: ${formatValue(summary.runConfig?.reportPath)}`,
    "",
    "## Engine",
    "",
    `- Recent alerts: ${formatValue(summary.engine?.recentAlerts)}`,
    `- Valid proofs: ${formatValue(summary.engine?.validProofs)}`,
    `- Latest alert id: ${formatValue(summary.engine?.latestAlertId)}`,
    `- Latest media type: ${formatValue(summary.engine?.latestMediaType)}`,
    "",
    "## Supabase",
    "",
    `- Persisted alerts: ${formatValue(summary.supabase?.persistedAlerts)}`,
    `- Valid proofs: ${formatValue(summary.supabase?.validProofs)}`,
    `- Latest alert id: ${formatValue(summary.supabase?.latestAlertId)}`,
    `- Latest media type: ${formatValue(summary.supabase?.latestMediaType)}`,
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
