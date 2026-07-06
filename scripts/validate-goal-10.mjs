#!/usr/bin/env node

import { spawn } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

const SITE_URL =
  getEnv("VALIDATION_SITE_URL") ||
  getEnv("NEXT_PUBLIC_SITE_URL") ||
  "http://127.0.0.1:3000";
const VALIDATION_ROUTE_PATHS = getEnvCSV("VALIDATION_ROUTE_PATHS", [
  "/",
  "/dashboard",
  "/alerts",
  "/history",
  "/settings",
  "/billing",
]);
const VALIDATION_INCLUDE_GOALS = getEnvCSVOrEmpty(
  "VALIDATION_INCLUDE_GOALS",
  ["5", "6", "7", "8", "9"]
);
const VALIDATION_RUN_WEB_TEST = getEnvBoolean("VALIDATION_RUN_WEB_TEST", true);
const VALIDATION_RUN_WEB_BUILD = getEnvBoolean("VALIDATION_RUN_WEB_BUILD", true);
const VALIDATION_REPORT_PATH = getEnv("VALIDATION_REPORT_PATH");

const goalEnvironmentRequirements = {
  "5": [
    ["ENGINE_STATUS_URL"],
  ],
  "6": [
    ["ENGINE_STATUS_URL"],
    ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
    ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
  ],
  "7": [
    ["ENGINE_STATUS_URL"],
  ],
  "8": [
    ["ENGINE_STATUS_URL"],
    ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
    ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    ["TELEGRAM_BOT_TOKEN"],
  ],
  "9": [
    ["STRIPE_SECRET_KEY"],
    ["STRIPE_SCOUT_PRICE_ID"],
    ["STRIPE_FOUNDING_ACCESS_PRICE_ID"],
    ["STRIPE_SENTINEL_PRO_PRICE_ID"],
  ],
};

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
  const environmentPreflight = buildEnvironmentPreflight();
  const web = {
    build: VALIDATION_RUN_WEB_BUILD
      ? await runCommandValidation({
          args: ["build"],
          command: "pnpm",
          cwd: resolve("web"),
          label: "web build",
        })
      : skippedValidation("web build skipped by configuration"),
    routes: await validateRoutes(),
    test: VALIDATION_RUN_WEB_TEST
      ? await runCommandValidation({
          args: ["test"],
          command: "pnpm",
          cwd: resolve("web"),
          label: "web test",
        })
      : skippedValidation("web test skipped by configuration"),
  };

  const delegatedGoals = [];

  for (const goalId of VALIDATION_INCLUDE_GOALS) {
    delegatedGoals.push(await runGoalValidation(goalId));
  }

  return {
    completedAt: new Date().toISOString(),
    delegatedGoals,
    environmentPreflight,
    failures: [...failures],
    overallStatus: failures.length ? "failed" : "passed",
    recommendations: buildRecommendations(environmentPreflight, web, delegatedGoals),
    runConfig: buildRunConfig(),
    warnings: [...warnings],
    web,
  };
}

function buildRunConfig() {
  return {
    includeGoals: VALIDATION_INCLUDE_GOALS,
    reportPath: VALIDATION_REPORT_PATH || null,
    routePaths: VALIDATION_ROUTE_PATHS,
    runWebBuild: VALIDATION_RUN_WEB_BUILD,
    runWebTest: VALIDATION_RUN_WEB_TEST,
    siteURL: SITE_URL,
  };
}

function buildRecommendations(environmentPreflight, web, delegatedGoals) {
  const items = [];

  if (environmentPreflight.some((item) => !item.ready)) {
    items.push(
      "Fill the missing Goal 10 preflight environment variables before running the full live-service launch audit."
    );
  }

  if (web.routes.some((route) => route.status !== 200)) {
    items.push("Fix the failing web route checks before treating Goal 10 as launch-ready.");
  }

  if (delegatedGoals.some((goal) => goal.status !== "passed")) {
    items.push(
      "Resolve the failing delegated goal validations so Goal 10 has end-to-end live-service evidence."
    );
  }

  if (!VALIDATION_RUN_WEB_TEST || !VALIDATION_RUN_WEB_BUILD) {
    items.push(
      "Re-enable both web test and web build in the Goal 10 audit before final production signoff."
    );
  }

  if (!items.length && warnings.length) {
    items.push(
      "Review warnings and clear remaining readiness gaps before treating this audit as public-launch approval."
    );
  }

  if (!items.length && !failures.length) {
    items.push("Preserve the JSON and markdown artifacts as Goal 10 launch evidence.");
  }

  return items;
}

function buildEnvironmentPreflight() {
  return VALIDATION_INCLUDE_GOALS.map((goalId) => {
    const requirementGroups = goalEnvironmentRequirements[goalId] ?? [];
    const missingGroups = requirementGroups
      .filter((group) => !group.some((envKey) => getEnv(envKey)))
      .map((group) => group.join(" or "));

    return {
      goalId,
      missing: missingGroups,
      ready: missingGroups.length === 0,
    };
  });
}

async function validateRoutes() {
  const results = [];

  for (const routePath of VALIDATION_ROUTE_PATHS) {
    const url = new URL(routePath, withTrailingSlash(SITE_URL)).toString();
    const result = await requestText(url);
    const bodyText = typeof result.body === "string" ? result.body : "";
    const hasSentinelContent =
      bodyText.includes("Sentinel Flow") || bodyText.includes("__next");

    if (result.status !== 200) {
      failures.push(`Route ${routePath} returned status ${result.status}.`);
    } else if (!hasSentinelContent) {
      warnings.push(`Route ${routePath} returned 200 but did not expose obvious Sentinel Flow content.`);
    }

    results.push({
      contentDetected: hasSentinelContent,
      routePath,
      status: result.status,
      url,
    });
  }

  return results;
}

async function runGoalValidation(goalId) {
  const scriptPath = resolve("scripts", `validate-goal-${goalId}.mjs`);
  const reportPath = deriveChildReportPath(goalId);
  const env = {
    ...process.env,
    VALIDATION_REPORT_PATH: reportPath,
  };

  const result = await runCommand({
    args: [scriptPath],
    command: process.execPath,
    cwd: resolve("."),
    env,
  });

  if (result.exitCode !== 0) {
    failures.push(`Goal ${goalId} delegated validation failed with exit code ${result.exitCode}.`);
  }

  return {
    exitCode: result.exitCode,
    label: `Goal ${goalId}`,
    reportPath,
    status: result.exitCode === 0 ? "passed" : "failed",
    stdoutPreview: tailPreview(result.stdout),
  };
}

async function runCommandValidation({ args, command, cwd, label }) {
  const result = await runCommand({
    args,
    command,
    cwd,
    env: process.env,
  });

  if (result.exitCode !== 0) {
    failures.push(`${label} failed with exit code ${result.exitCode}.`);
  }

  return {
    exitCode: result.exitCode,
    status: result.exitCode === 0 ? "passed" : "failed",
    stdoutPreview: tailPreview(result.stdout),
  };
}

function skippedValidation(reason) {
  return {
    exitCode: null,
    status: "skipped",
    stdoutPreview: reason,
  };
}

async function runCommand({ command, args, cwd, env }) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      stderr += error.message;
    });

    child.on("close", (exitCode) => {
      if (stderr.trim() && (exitCode ?? 1) !== 0) {
        warnings.push(`${command} ${args.join(" ")} emitted stderr output.`);
      }

      resolvePromise({
        exitCode: exitCode ?? 1,
        stderr,
        stdout,
      });
    });
  });
}

function deriveChildReportPath(goalId) {
  if (!VALIDATION_REPORT_PATH) {
    return join("artifacts", `goal-${goalId}-validation-from-goal-10.json`);
  }

  const extension = extname(VALIDATION_REPORT_PATH) || ".json";
  const directory = dirname(VALIDATION_REPORT_PATH);
  return join(directory, `goal-${goalId}-validation-from-goal-10${extension}`);
}

async function requestText(url) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
    });

    return {
      body: await response.text(),
      status: response.status,
    };
  } catch (error) {
    failures.push(
      `Request failed for ${url}: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      body: "",
      status: 0,
    };
  }
}

function printSummary(summary) {
  console.log("Goal 10 Launch Audit Summary");
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
    console.log("Launch audit checks completed without hard failures.");
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
    "# Goal 10 Launch Audit Report",
    "",
    `- Completed at: ${summary.completedAt}`,
    `- Overall status: ${summary.overallStatus}`,
    "",
    "## Run Config",
    "",
    `- Site URL: ${formatValue(summary.runConfig?.siteURL)}`,
    `- Route paths: ${formatValue(summary.runConfig?.routePaths?.join(", "))}`,
    `- Included delegated goals: ${formatValue(summary.runConfig?.includeGoals?.join(", "))}`,
    `- Run web test: ${formatValue(summary.runConfig?.runWebTest)}`,
    `- Run web build: ${formatValue(summary.runConfig?.runWebBuild)}`,
    `- Report path: ${formatValue(summary.runConfig?.reportPath)}`,
    "",
    "## Environment Preflight",
    "",
    ...formatPreflight(summary.environmentPreflight),
    "",
    "## Web",
    "",
    `- Web test status: ${formatValue(summary.web?.test?.status)}`,
    `- Web build status: ${formatValue(summary.web?.build?.status)}`,
    "",
    "### Route Checks",
    "",
    ...summary.web.routes.map(
      (route) =>
        `- ${route.routePath}: status ${route.status}, content detected ${route.contentDetected}`
    ),
    "",
    "## Delegated Goals",
    "",
    ...summary.delegatedGoals.map(
      (goal) =>
        `- ${goal.label}: ${goal.status} (exit ${goal.exitCode}, report ${goal.reportPath})`
    ),
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

function formatPreflight(items) {
  if (!items?.length) {
    return ["- No delegated goal preflight checks configured"];
  }

  return items.map((item) => {
    const suffix = item.ready ? "ready" : `missing ${item.missing.join("; ")}`;
    return `- Goal ${item.goalId}: ${suffix}`;
  });
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  return String(value);
}

function tailPreview(output) {
  const trimmed = output.trim();
  if (!trimmed) {
    return "";
  }

  const lines = trimmed.split(/\r?\n/);
  return lines.slice(-8).join("\n");
}

function withTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
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

function getEnvCSVOrEmpty(key, fallback) {
  if (!(key in process.env)) {
    return fallback;
  }

  const value = process.env[key];
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  if (!normalized || normalized === "__none__") {
    return [];
  }

  return normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

main();
