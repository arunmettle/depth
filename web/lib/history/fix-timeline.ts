import type { AlertRecord } from "@/lib/history/schema";

/**
 * The moment `BuildTradePlan` started enforcing the 0.75% minimum
 * stop-distance floor in production (engine commit 93e14bb, redeployed to
 * Railway the same day). Alerts created before this timestamp can have
 * stops tighter than round-trip trading costs and are not representative
 * of current strategy performance - see docs/PROFITABILITY_AFTER_COSTS.md.
 */
export const STOP_FLOOR_FIX_DEPLOYED_AT = "2026-07-09T00:06:57Z";

/** Below this many resolved alerts, win rate / R stats are too noisy to trust. */
export const MINIMUM_TRUSTWORTHY_SAMPLE_SIZE = 30;

export function isPostFixAlert(item: AlertRecord): boolean {
  return new Date(item.createdAt).getTime() >= new Date(STOP_FLOOR_FIX_DEPLOYED_AT).getTime();
}

export function partitionByFixTimeline(items: AlertRecord[]): {
  postFix: AlertRecord[];
  preFix: AlertRecord[];
} {
  const postFix: AlertRecord[] = [];
  const preFix: AlertRecord[] = [];

  for (const item of items) {
    if (isPostFixAlert(item)) {
      postFix.push(item);
    } else {
      preFix.push(item);
    }
  }

  return { postFix, preFix };
}
