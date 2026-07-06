#!/usr/bin/env node

import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const options = {
  reportDirectory: "artifacts",
  skipDelegatedGoals: false,
  skipWebChecks: false,
};

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];

  if (argument === "--skip-web-checks") {
    options.skipWebChecks = true;
    continue;
  }

  if (argument === "--skip-delegated-goals") {
    options.skipDelegatedGoals = true;
    continue;
  }

  if (argument === "--report-dir") {
    options.reportDirectory = args[index + 1] || options.reportDirectory;
    index += 1;
  }
}

async function main() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");
  const launchAuditReportPath = join(
    resolve(options.reportDirectory),
    `goal-10-validation-${timestamp}.json`
  );
  const summaryReportPath = join(
    resolve(options.reportDirectory),
    `launch-evidence-summary-${timestamp}.json`
  );

  const baseEnv = {
    ...process.env,
    VALIDATION_REPORT_PATH: launchAuditReportPath,
  };

  if (options.skipWebChecks) {
    baseEnv.VALIDATION_RUN_WEB_TEST = "false";
    baseEnv.VALIDATION_RUN_WEB_BUILD = "false";
  }

  if (options.skipDelegatedGoals) {
    baseEnv.VALIDATION_INCLUDE_GOALS = "__none__";
  }

  console.log(`Goal 10 validation report will be written to ${launchAuditReportPath}`);

  const launchAuditResult = await runNodeScript("scripts/validate-goal-10.mjs", baseEnv);
  if (launchAuditResult !== 0) {
    process.exit(launchAuditResult);
  }

  console.log("");
  console.log("Goal 10 validation completed successfully.");
  console.log(`JSON report artifact: ${launchAuditReportPath}`);
  console.log(
    `Markdown report artifact: ${launchAuditReportPath.replace(/\.json$/i, ".md")}`
  );

  const summaryEnv = {
    ...baseEnv,
    VALIDATION_REPORT_PATH: summaryReportPath,
  };

  console.log("");
  console.log(`Launch evidence summary will be written to ${summaryReportPath}`);

  const summaryResult = await runNodeScript(
    "scripts/summarize-launch-evidence.mjs",
    summaryEnv
  );
  if (summaryResult !== 0) {
    process.exit(summaryResult);
  }

  console.log("");
  console.log("Launch evidence summary completed successfully.");
  console.log(`Summary JSON artifact: ${summaryReportPath}`);
  console.log(
    `Latest summary JSON artifact: ${join(
      resolve(options.reportDirectory),
      "launch-evidence-summary-latest.json"
    )}`
  );
}

async function runNodeScript(scriptPath, env) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [resolve(scriptPath)], {
      cwd: resolve("."),
      env,
      shell: false,
      stdio: "inherit",
    });

    child.on("close", (exitCode) => {
      resolvePromise(exitCode ?? 1);
    });

    child.on("error", () => {
      resolvePromise(1);
    });
  });
}

main();
