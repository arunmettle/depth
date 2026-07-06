#!/usr/bin/env node

import { copyFile, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

const ARTIFACTS_DIR = resolve(getEnv("VALIDATION_ARTIFACTS_DIR") || "artifacts");
const VALIDATION_GOAL_IDS = getEnvCSVOrEmpty("VALIDATION_GOAL_IDS", [
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
]);
const VALIDATION_REPORT_PATH = getEnv("VALIDATION_REPORT_PATH");

async function main() {
  const summary = await buildSummary();
  const output = JSON.stringify(summary, null, 2);
  const markdown = buildMarkdownSummary(summary);

  console.log(output);

  if (VALIDATION_REPORT_PATH) {
    await writeFile(VALIDATION_REPORT_PATH, `${output}\n`, "utf8");
    const markdownPath = deriveMarkdownReportPath(VALIDATION_REPORT_PATH);
    const latestJsonPath = deriveLatestReportPath(VALIDATION_REPORT_PATH);
    const latestMarkdownPath = deriveMarkdownReportPath(latestJsonPath);
    await writeFile(markdownPath, markdown, "utf8");
    await copyFile(VALIDATION_REPORT_PATH, latestJsonPath);
    await copyFile(markdownPath, latestMarkdownPath);
    console.log("");
    console.log(`Launch evidence summary written to ${VALIDATION_REPORT_PATH}`);
    console.log(`Launch evidence markdown written to ${markdownPath}`);
    console.log(`Latest summary JSON artifact updated at ${latestJsonPath}`);
    console.log(`Latest summary markdown artifact updated at ${latestMarkdownPath}`);
  }
}

async function buildSummary() {
  const entries = await loadGoalEntries();
  const failingGoals = entries.filter((entry) => entry.status !== "passed");

  return {
    artifactsDirectory: ARTIFACTS_DIR,
    completedAt: new Date().toISOString(),
    failingGoals: failingGoals.map((entry) => entry.goalId),
    goalCount: entries.length,
    goals: entries,
    overallStatus: failingGoals.length ? "needs-attention" : "ready-for-review",
    recommendations: buildRecommendations(entries),
  };
}

async function loadGoalEntries() {
  const artifactNames = await readdir(ARTIFACTS_DIR);
  const entries = [];

  for (const goalId of VALIDATION_GOAL_IDS) {
    const artifactName = pickLatestArtifactName(goalId, artifactNames);
    if (!artifactName) {
      entries.push({
        artifactPath: null,
        failureCount: null,
        goalId,
        hasWarnings: null,
        missingArtifact: true,
        overallStatus: null,
        status: "missing-artifact",
        summary: "No latest artifact found.",
      });
      continue;
    }

    const artifactPath = join(ARTIFACTS_DIR, artifactName);
    const raw = await readFile(artifactPath, "utf8");
    const parsed = JSON.parse(raw);
    const failures = Array.isArray(parsed.failures) ? parsed.failures : [];
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
    const status = parsed.overallStatus === "passed" ? "passed" : "needs-attention";

    entries.push({
      artifactPath,
      failureCount: failures.length,
      goalId,
      hasWarnings: warnings.length > 0,
      missingArtifact: false,
      overallStatus: parsed.overallStatus ?? null,
      status,
      summary: buildEntrySummary(goalId, parsed, failures, warnings),
    });
  }

  return entries;
}

function pickLatestArtifactName(goalId, artifactNames) {
  const priorityPatterns = [
    new RegExp(`^goal-${goalId}-validation-from-goal-10-latest\\.json$`, "i"),
    new RegExp(`^goal-${goalId}-validation-smoke-latest\\.json$`, "i"),
    new RegExp(`^goal-${goalId}-smoke-latest\\.json$`, "i"),
    new RegExp(`^goal-${goalId}-latest.*latest\\.json$`, "i"),
    new RegExp(`^goal-${goalId}.*latest\\.json$`, "i"),
  ];

  for (const pattern of priorityPatterns) {
    const match = artifactNames.find((name) => pattern.test(name));
    if (match) {
      return match;
    }
  }

  return null;
}

function buildEntrySummary(goalId, parsed, failures, warnings) {
  const baseStatus =
    parsed.overallStatus === "passed"
      ? "passed"
      : `${failures.length} failure${failures.length === 1 ? "" : "s"}`;
  const warningSuffix = warnings.length
    ? `, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
    : "";

  switch (goalId) {
    case "5":
      return `Engine validation ${baseStatus}${warningSuffix}.`;
    case "6":
      return `Persisted-rule sync validation ${baseStatus}${warningSuffix}.`;
    case "7":
      return `Proof contract validation ${baseStatus}${warningSuffix}.`;
    case "8":
      return `Telegram delivery and history validation ${baseStatus}${warningSuffix}.`;
    case "9":
      return `Billing validation ${baseStatus}${warningSuffix}.`;
    case "10":
      return `Launch audit ${baseStatus}${warningSuffix}.`;
    default:
      return `Goal ${goalId} validation ${baseStatus}${warningSuffix}.`;
  }
}

function buildRecommendations(entries) {
  const items = [];

  const missingArtifacts = entries.filter((entry) => entry.missingArtifact);
  if (missingArtifacts.length) {
    items.push(
      `Generate latest artifacts for goals ${missingArtifacts
        .map((entry) => entry.goalId)
        .join(", ")} before final launch review.`
    );
  }

  const failingGoals = entries.filter(
    (entry) => !entry.missingArtifact && entry.status !== "passed"
  );
  if (failingGoals.length) {
    items.push(
      `Resolve the latest failing validation evidence for goals ${failingGoals
        .map((entry) => entry.goalId)
        .join(", ")} before treating the build as launch-ready.`
    );
  }

  if (!items.length) {
    items.push("Latest launch evidence is clean enough for human release review.");
  }

  return items;
}

function buildMarkdownSummary(summary) {
  const lines = [
    "# Launch Evidence Summary",
    "",
    `- Completed at: ${summary.completedAt}`,
    `- Overall status: ${summary.overallStatus}`,
    `- Artifacts directory: ${summary.artifactsDirectory}`,
    `- Goal count: ${summary.goalCount}`,
    "",
    "## Goal Status",
    "",
    ...summary.goals.map(
      (goal) =>
        `- Goal ${goal.goalId}: ${goal.status} (${goal.summary})${
          goal.artifactPath ? ` Artifact: ${goal.artifactPath}` : ""
        }`
    ),
    "",
    "## Failing Goals",
    "",
    ...(summary.failingGoals.length
      ? summary.failingGoals.map((goalId) => `- Goal ${goalId}`)
      : ["- None"]),
    "",
    "## Recommendations",
    "",
    ...summary.recommendations.map((item) => `- ${item}`),
    "",
  ];

  return lines.join("\n");
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

function getEnv(key) {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : "";
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
