#!/usr/bin/env node

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

const SITE_URL =
  getEnv("VALIDATION_SITE_URL") ||
  getEnv("NEXT_PUBLIC_SITE_URL") ||
  "http://127.0.0.1:3000";
const STRIPE_SECRET_KEY = getEnv("STRIPE_SECRET_KEY");
const SUPABASE_URL = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SECRET_KEY =
  getEnv("SUPABASE_SECRET_KEY") || getEnv("SUPABASE_SERVICE_ROLE_KEY");
const VALIDATION_EXPECT_PLAN_KEYS = getEnvCSVOrEmpty("VALIDATION_EXPECT_PLAN_KEYS", [
  "scout",
  "founding_access",
  "sentinel_pro",
]);
const VALIDATION_REPORT_PATH = getEnv("VALIDATION_REPORT_PATH");
const VALIDATION_USER_ID = getEnv("VALIDATION_USER_ID");

const planPriceEnvMap = {
  alpha_stream: "STRIPE_ALPHA_STREAM_PRICE_ID",
  founding_access: "STRIPE_FOUNDING_ACCESS_PRICE_ID",
  scout: "STRIPE_SCOUT_PRICE_ID",
  sentinel_pro: "STRIPE_SENTINEL_PRO_PRICE_ID",
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
  if (!STRIPE_SECRET_KEY) {
    failures.push("Missing STRIPE_SECRET_KEY");
  }

  const missingExpectedPriceEnv = VALIDATION_EXPECT_PLAN_KEYS.filter((planKey) => {
    const envKey = planPriceEnvMap[planKey];
    return !getEnv(envKey);
  });

  for (const planKey of missingExpectedPriceEnv) {
    failures.push(`Missing ${planPriceEnvMap[planKey]} for plan ${planKey}`);
  }

  const [billingRoute, stripe, supabase] = await Promise.all([
    validateBillingRoute(),
    STRIPE_SECRET_KEY ? validateStripe() : null,
    SUPABASE_URL && SUPABASE_SECRET_KEY ? validateSupabaseBilling() : null,
  ]);

  compareStripeAndSupabase(stripe, supabase);

  return {
    billingRoute,
    completedAt: new Date().toISOString(),
    failures: [...failures],
    overallStatus: failures.length ? "failed" : "passed",
    recommendations: buildRecommendations(),
    runConfig: buildRunConfig(),
    stripe,
    supabase,
    warnings: [...warnings],
  };
}

function buildRunConfig() {
  return {
    expectPlanKeys: VALIDATION_EXPECT_PLAN_KEYS,
    reportPath: VALIDATION_REPORT_PATH || null,
    siteURL: SITE_URL,
    stripeConfigured: Boolean(STRIPE_SECRET_KEY),
    supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY),
    validationUserScoped: Boolean(VALIDATION_USER_ID),
  };
}

function buildRecommendations() {
  const items = [];

  if (!STRIPE_SECRET_KEY) {
    items.push("Set STRIPE_SECRET_KEY so the Goal 9 harness can verify live Stripe configuration.");
  }

  if (VALIDATION_EXPECT_PLAN_KEYS.some((planKey) => !getEnv(planPriceEnvMap[planKey]))) {
    items.push("Add the expected Stripe price IDs so live plan verification can complete.");
  }

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    items.push("Set SUPABASE_URL and SUPABASE_SECRET_KEY to compare Stripe state against persisted billing_accounts rows.");
  }

  if (!VALIDATION_USER_ID) {
    items.push("Set VALIDATION_USER_ID to validate one real trader billing record instead of project-wide billing state.");
  }

  if (!items.length && warnings.length) {
    items.push("Review the warnings and resolve remaining billing gaps before treating Goal 9 as launch-ready.");
  }

  if (!items.length && !failures.length) {
    items.push("Preserve the JSON and markdown artifacts as Goal 9 billing signoff evidence.");
  }

  return items;
}

async function validateBillingRoute() {
  const url = new URL("/billing", withTrailingSlash(SITE_URL)).toString();
  const response = await requestText(url);
  const body = typeof response.body === "string" ? response.body : "";
  const hasExpectedContent =
    body.includes("Billing and access control") || body.includes("Sentinel Flow");

  if (response.status !== 200) {
    failures.push(`Billing route check failed with status ${response.status}.`);
  } else if (!hasExpectedContent) {
    warnings.push("Billing route returned 200 but did not expose the expected billing content.");
  }

  return {
    contentDetected: hasExpectedContent,
    status: response.status,
    url,
  };
}

async function validateStripe() {
  const account = await requestStripeJSON("https://api.stripe.com/v1/account");
  if (account.status !== 200 || !account.body?.id) {
    failures.push("Stripe account lookup failed for the configured secret key.");
  }

  const prices = [];
  for (const planKey of VALIDATION_EXPECT_PLAN_KEYS) {
    const priceId = getEnv(planPriceEnvMap[planKey]);
    const priceResponse = await requestStripeJSON(
      `https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`
    );

    if (priceResponse.status !== 200) {
      failures.push(`Stripe price lookup failed for ${planKey} (${priceId}) with status ${priceResponse.status}.`);
      prices.push({
        active: null,
        currency: null,
        lookupKey: null,
        planKey,
        priceId,
        recurringInterval: null,
        status: priceResponse.status,
        type: null,
      });
      continue;
    }

    const price = priceResponse.body;
    if (!price.active) {
      failures.push(`Stripe price ${priceId} for ${planKey} is not active.`);
    }

    if (price.type !== "recurring" || !price.recurring?.interval) {
      failures.push(`Stripe price ${priceId} for ${planKey} is not a recurring billing price.`);
    }

    prices.push({
      active: Boolean(price.active),
      currency: price.currency ?? null,
      lookupKey: Array.isArray(price.lookup_key) ? price.lookup_key.join(",") : price.lookup_key ?? null,
      planKey,
      priceId,
      recurringInterval: price.recurring?.interval ?? null,
      status: priceResponse.status,
      type: price.type ?? null,
    });
  }

  const alphaStreamPriceId = getEnv(planPriceEnvMap.alpha_stream);
  if (!alphaStreamPriceId) {
    warnings.push("STRIPE_ALPHA_STREAM_PRICE_ID is not configured, so Alpha Stream remains sales-led for now.");
  }

  return {
    accountId: account.body?.id ?? null,
    accountLiveMode: account.body?.livemode ?? null,
    prices,
  };
}

async function validateSupabaseBilling() {
  const response = await selectRows("billing_accounts", {
    select:
      "user_id,plan_key,subscription_status,stripe_customer_id,stripe_price_id,stripe_subscription_id,current_period_end,trial_ends_at,cancel_at_period_end",
    order: "updated_at.desc",
  });

  if (response.status !== 200) {
    failures.push(`Supabase billing_accounts query failed with status ${response.status}.`);
  }

  const rows = Array.isArray(response.body) ? response.body : [];
  if (!rows.length) {
    warnings.push(
      VALIDATION_USER_ID
        ? `No billing_accounts rows found yet for VALIDATION_USER_ID=${VALIDATION_USER_ID}.`
        : "No billing_accounts rows found yet. Complete at least one real checkout before Goal 9 signoff."
    );
  }

  const invalidRows = rows.filter((row) => !isValidBillingRow(row));
  if (invalidRows.length) {
    failures.push(`Supabase returned ${invalidRows.length} billing_accounts rows that do not satisfy the billing contract.`);
  }

  return {
    activePaidRows: rows.filter((row) => ["active", "trialing"].includes(row.subscription_status)).length,
    invalidRows: invalidRows.length,
    latestPlanKey: rows[0]?.plan_key ?? null,
    latestStatus: rows[0]?.subscription_status ?? null,
    rowCount: rows.length,
    validationUserMatched: VALIDATION_USER_ID ? rows.length > 0 : null,
  };
}

function compareStripeAndSupabase(stripe, supabase) {
  if (!stripe || !supabase) {
    return;
  }

  if (!supabase.rowCount) {
    return;
  }

  const configuredPriceIds = new Set(
    stripe.prices.map((price) => price.priceId).filter(Boolean)
  );

  if (supabase.latestStatus && supabase.latestPlanKey && !configuredPriceIds.has(stripe.prices.find((price) => price.planKey === supabase.latestPlanKey)?.priceId)) {
    warnings.push(
      `Latest persisted billing row points to plan ${supabase.latestPlanKey}, which was not part of the expected live price validation set.`
    );
  }
}

function isValidBillingRow(row) {
  return Boolean(
    row?.user_id &&
      row?.subscription_status &&
      (row?.stripe_customer_id || row?.subscription_status === "inactive")
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

async function requestStripeJSON(url) {
  return requestJSON(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    },
  });
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
      `Request failed for ${String(url)}: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      body: "",
      status: 0,
    };
  }
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
  console.log("Goal 9 Live Validation Summary");
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
    "# Goal 9 Validation Report",
    "",
    `- Completed at: ${summary.completedAt}`,
    `- Overall status: ${summary.overallStatus}`,
    "",
    "## Run Config",
    "",
    `- Site URL: ${formatValue(summary.runConfig?.siteURL)}`,
    `- Stripe configured: ${formatValue(summary.runConfig?.stripeConfigured)}`,
    `- Supabase configured: ${formatValue(summary.runConfig?.supabaseConfigured)}`,
    `- Expected plan keys: ${formatValue(summary.runConfig?.expectPlanKeys?.join(", "))}`,
    `- Validation user scoped: ${formatValue(summary.runConfig?.validationUserScoped)}`,
    `- Report path: ${formatValue(summary.runConfig?.reportPath)}`,
    "",
    "## Billing Route",
    "",
    `- URL: ${formatValue(summary.billingRoute?.url)}`,
    `- Status: ${formatValue(summary.billingRoute?.status)}`,
    `- Content detected: ${formatValue(summary.billingRoute?.contentDetected)}`,
    "",
    "## Stripe",
    "",
    `- Account id: ${formatValue(summary.stripe?.accountId)}`,
    `- Live mode: ${formatValue(summary.stripe?.accountLiveMode)}`,
    ...formatPriceList(summary.stripe?.prices),
    "",
    "## Supabase",
    "",
    `- Row count: ${formatValue(summary.supabase?.rowCount)}`,
    `- Active paid rows: ${formatValue(summary.supabase?.activePaidRows)}`,
    `- Invalid rows: ${formatValue(summary.supabase?.invalidRows)}`,
    `- Latest plan key: ${formatValue(summary.supabase?.latestPlanKey)}`,
    `- Latest status: ${formatValue(summary.supabase?.latestStatus)}`,
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

function formatPriceList(prices) {
  if (!prices?.length) {
    return ["- No Stripe prices validated"];
  }

  return prices.map(
    (price) =>
      `- ${price.planKey}: ${price.priceId} status ${price.status}, active ${price.active}, type ${price.type}, interval ${price.recurringInterval}, currency ${price.currency}`
  );
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

function withTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
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
  if (!normalized) {
    return [];
  }

  return normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

main();
