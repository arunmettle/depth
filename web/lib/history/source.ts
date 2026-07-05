import { fromEngineRecentAlert } from "@/lib/history/adapter";
import { mockHistoryItems } from "@/lib/history/mock";
import {
  getPersistedAlertHistoryForCurrentUser,
  getPersistedAlertHistoryRecordForCurrentUser,
} from "@/lib/history/records";
import type { AlertRecord, EngineRecentAlertRecord } from "@/lib/history/schema";

type EngineHistoryPayload = {
  stream?: {
    evaluator?: {
      recentAlerts?: EngineRecentAlertRecord[];
    };
  };
};

export type HistorySourceResult = {
  items: AlertRecord[];
  source: "engine" | "mock" | "supabase";
};

function getEngineStatusURL() {
  return process.env.ENGINE_STATUS_URL?.trim() || null;
}

export function mapEngineHistoryPayload(payload: EngineHistoryPayload): AlertRecord[] {
  const recentAlerts = payload.stream?.evaluator?.recentAlerts;

  if (!recentAlerts?.length) {
    return [];
  }

  return recentAlerts.map((record) => fromEngineRecentAlert(record));
}

export function findHistoryRecord(items: AlertRecord[], id: string) {
  return items.find((item) => item.id === id) ?? null;
}

export async function getHistorySource(): Promise<HistorySourceResult> {
  const persistedItems = await getPersistedAlertHistoryForCurrentUser();
  if (persistedItems) {
    return {
      items: persistedItems,
      source: "supabase",
    };
  }

  const url = getEngineStatusURL();
  if (!url) {
    return {
      items: mockHistoryItems,
      source: "mock",
    };
  }

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`history status request failed with ${response.status}`);
    }

    const payload = (await response.json()) as EngineHistoryPayload;
    const items = mapEngineHistoryPayload(payload);

    return {
      items: items.length ? items : mockHistoryItems,
      source: items.length ? "engine" : "mock",
    };
  } catch {
    return {
      items: mockHistoryItems,
      source: "mock",
    };
  }
}

export async function getHistoryRecordById(id: string) {
  const persisted = await getPersistedAlertHistoryRecordForCurrentUser(id);
  if (persisted.available) {
    return {
      item: persisted.item,
      source: "supabase" as const,
    };
  }

  const history = await getHistorySource();

  return {
    item: findHistoryRecord(history.items, id),
    source: history.source,
  };
}
