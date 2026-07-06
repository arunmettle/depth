import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

import {
  deleteAlertRuleForCurrentUser,
  getAlertRuleForCurrentUser,
  getAlertRulesForCurrentUser,
  upsertAlertRuleForCurrentUser,
} from "@/lib/alerts/rules";

function createSelectChain(options?: {
  data?: unknown;
  error?: unknown;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: options?.data ?? null,
    error: options?.error ?? null,
  });
  const order = vi.fn().mockResolvedValue({
    data: options?.data ?? null,
    error: options?.error ?? null,
  });
  const eqSecond = vi.fn(() => ({
    maybeSingle,
  }));
  const eqFirst = vi.fn((field: string) => {
    if (field === "user_id") {
      return {
        eq: eqSecond,
        maybeSingle,
        order,
      };
    }

    return {
      eq: eqSecond,
      maybeSingle,
      order,
    };
  });
  const select = vi.fn(() => ({
    eq: eqFirst,
    order,
    maybeSingle,
  }));

  return {
    eqFirst,
    eqSecond,
    maybeSingle,
    order,
    select,
  };
}

function createMutationChain(resultError: unknown = null) {
  const eqSecond = vi.fn().mockResolvedValue({ error: resultError });
  const eqFirst = vi.fn(() => ({
    eq: eqSecond,
  }));
  const update = vi.fn(() => ({
    eq: eqFirst,
  }));
  const deleteFn = vi.fn(() => ({
    eq: eqFirst,
  }));
  const insert = vi.fn().mockResolvedValue({ error: resultError });

  return {
    deleteFn,
    eqFirst,
    eqSecond,
    insert,
    update,
  };
}

function buildSupabaseStub(args?: {
  activeRuleIds?: string[];
  billingData?: unknown;
  deleteError?: unknown;
  getUserId?: string | null;
  insertError?: unknown;
  listData?: unknown;
  singleData?: unknown;
  singleError?: unknown;
  updateError?: unknown;
}) {
  const selectChain = createSelectChain({
    data: args?.listData,
    error: null,
  });
  const singleChain = createSelectChain({
    data: args?.singleData,
    error: args?.singleError ?? null,
  });
  const updateChain = createMutationChain(args?.updateError ?? null);
  const deleteChain = createMutationChain(args?.deleteError ?? null);
  const insert = vi.fn().mockResolvedValue({ error: args?.insertError ?? null });

  const from = vi.fn((table: string) => {
    if (table === "billing_accounts") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: args?.billingData ?? null,
              error: null,
            }),
          })),
        })),
      };
    }

    if (table === "alert_rules") {
      return {
        delete: deleteChain.deleteFn,
        insert,
        select: vi.fn((query?: string) => {
          if (query === "id") {
            return {
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  data: (args?.activeRuleIds ?? []).map((id) => ({ id })),
                  error: null,
                }),
              })),
            };
          }

          if (query?.includes("created_at")) {
            return {
              eq: vi.fn((field: string) => {
                if (field === "user_id" && args?.singleData !== undefined) {
                  return {
                    eq: singleChain.eqSecond,
                    maybeSingle: singleChain.maybeSingle,
                  };
                }

                return {
                  eq: singleChain.eqSecond,
                  maybeSingle: singleChain.maybeSingle,
                  order: selectChain.order,
                };
              }),
              order: selectChain.order,
              maybeSingle: singleChain.maybeSingle,
            };
          }

          return {
            eq: singleChain.eqFirst,
            maybeSingle: singleChain.maybeSingle,
            order: selectChain.order,
          };
        }),
        update: updateChain.update,
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user:
            args?.getUserId === null
              ? null
              : {
                  id: args?.getUserId ?? "user-123",
                },
        },
      }),
    },
    chains: {
      deleteChain,
      insert,
      selectChain,
      singleChain,
      updateChain,
    },
    from,
  };
}

describe("alert rules persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T09:10:00.000Z"));
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  });

  it("returns an empty list when Supabase is not configured", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);

    await expect(getAlertRulesForCurrentUser()).resolves.toEqual([]);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("maps persisted rules for the current user", async () => {
    const supabase = buildSupabaseStub({
      listData: [
        {
          created_at: "2026-07-05T00:00:00.000Z",
          destination: "telegram",
          id: "rule-1",
          market_symbol: "BTCUSDT",
          name: "BTC 5m stacked follow-through",
          params: {
            confirmationRows: 3,
            thresholdMultiplier: 300,
          },
          rule_type: "stacked_imbalance",
          status: "active",
          timeframe: "5m",
          updated_at: "2026-07-06T00:00:00.000Z",
          user_id: "user-123",
        },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await getAlertRulesForCurrentUser();

    expect(result).toEqual([
      {
        createdAt: "2026-07-05T00:00:00.000Z",
        destination: "telegram",
        id: "rule-1",
        marketSymbol: "BTCUSDT",
        name: "BTC 5m stacked follow-through",
        params: {
          confirmationRows: 3,
          thresholdMultiplier: 300,
        },
        ruleType: "stacked_imbalance",
        status: "active",
        timeframe: "5m",
        updatedAt: "2026-07-06T00:00:00.000Z",
        userId: "user-123",
      },
    ]);
  });

  it("returns null for a missing current-user rule lookup", async () => {
    const supabase = buildSupabaseStub({
      singleData: null,
      singleError: { message: "not found" },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await expect(getAlertRuleForCurrentUser("rule-missing")).resolves.toBeNull();
  });

  it("throws when saving without Supabase configuration", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);

    await expect(
      upsertAlertRuleForCurrentUser({
        marketSymbol: "BTCUSDT",
        name: "Rule",
        params: {
          confirmationRows: 3,
          thresholdMultiplier: 300,
        },
        ruleType: "stacked_imbalance",
        status: "active",
        timeframe: "5m",
      })
    ).rejects.toThrow("Supabase is not configured");
  });

  it("throws when saving without an authenticated user", async () => {
    const supabase = buildSupabaseStub({
      getUserId: null,
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await expect(
      upsertAlertRuleForCurrentUser({
        marketSymbol: "BTCUSDT",
        name: "Rule",
        params: {
          confirmationRows: 3,
          thresholdMultiplier: 300,
        },
        ruleType: "stacked_imbalance",
        status: "active",
        timeframe: "5m",
      })
    ).rejects.toThrow("You must be signed in");
  });

  it("blocks activating a rule when no paid billing plan is live", async () => {
    const supabase = buildSupabaseStub();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await expect(
      upsertAlertRuleForCurrentUser({
        marketSymbol: "BTCUSDT",
        name: "Rule",
        params: {
          confirmationRows: 3,
          thresholdMultiplier: 300,
        },
        ruleType: "stacked_imbalance",
        status: "active",
        timeframe: "5m",
      })
    ).rejects.toThrow("Start a paid plan on Billing before activating live alert rules.");
  });

  it("blocks a third active rule on the Scout plan", async () => {
    const supabase = buildSupabaseStub({
      activeRuleIds: ["rule-1", "rule-2"],
      billingData: {
        plan_key: "scout",
        subscription_status: "active",
      },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await expect(
      upsertAlertRuleForCurrentUser({
        marketSymbol: "BTCUSDT",
        name: "Rule",
        params: {
          confirmationRows: 3,
          thresholdMultiplier: 300,
        },
        ruleType: "stacked_imbalance",
        status: "active",
        timeframe: "5m",
      })
    ).rejects.toThrow("supports 2 active alert rules");
  });

  it("allows updating an already-active Scout rule without counting it twice", async () => {
    const supabase = buildSupabaseStub({
      activeRuleIds: ["rule-123", "rule-2"],
      billingData: {
        plan_key: "scout",
        subscription_status: "active",
      },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await expect(
      upsertAlertRuleForCurrentUser({
        id: "rule-123",
        marketSymbol: "BTCUSDT",
        name: "Rule",
        params: {
          confirmationRows: 3,
          thresholdMultiplier: 300,
        },
        ruleType: "stacked_imbalance",
        status: "active",
        timeframe: "5m",
      })
    ).resolves.toBeUndefined();
  });

  it("inserts a new current-user rule with created and updated timestamps", async () => {
    const supabase = buildSupabaseStub({
      billingData: {
        plan_key: "sentinel_pro",
        subscription_status: "active",
      },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await upsertAlertRuleForCurrentUser({
      marketSymbol: "BTCUSDT",
      name: "BTC 5m stacked follow-through",
      params: {
        confirmationRows: 3,
        thresholdMultiplier: 300,
      },
      ruleType: "stacked_imbalance",
      status: "active",
      timeframe: "5m",
    });

    expect(supabase.chains.insert).toHaveBeenCalledWith({
      created_at: "2026-07-06T09:10:00.000Z",
      destination: "telegram",
      id: undefined,
      market_symbol: "BTCUSDT",
      name: "BTC 5m stacked follow-through",
      params: {
        confirmationRows: 3,
        thresholdMultiplier: 300,
      },
      rule_type: "stacked_imbalance",
      status: "active",
      timeframe: "5m",
      updated_at: "2026-07-06T09:10:00.000Z",
      user_id: "user-123",
    });
  });

  it("updates a rule using both rule id and current user id filters", async () => {
    const supabase = buildSupabaseStub({
      activeRuleIds: ["rule-123"],
      billingData: {
        plan_key: "sentinel_pro",
        subscription_status: "active",
      },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await upsertAlertRuleForCurrentUser({
      id: "rule-123",
      marketSymbol: "ETHUSDT",
      name: "ETH 15m trapped traders",
      params: {
        minAbsorptionVolume: 500000,
        trapSide: "buyers",
      },
      ruleType: "trapped_traders",
      status: "paused",
      timeframe: "15m",
    });

    expect(supabase.chains.updateChain.update).toHaveBeenCalledWith({
      destination: "telegram",
      id: "rule-123",
      market_symbol: "ETHUSDT",
      name: "ETH 15m trapped traders",
      params: {
        minAbsorptionVolume: 500000,
        trapSide: "buyers",
      },
      rule_type: "trapped_traders",
      status: "paused",
      timeframe: "15m",
      updated_at: "2026-07-06T09:10:00.000Z",
      user_id: "user-123",
    });
    expect(supabase.chains.updateChain.eqFirst).toHaveBeenCalledWith("id", "rule-123");
    expect(supabase.chains.updateChain.eqSecond).toHaveBeenCalledWith(
      "user_id",
      "user-123"
    );
  });

  it("throws when delete fails for the current user", async () => {
    const supabase = buildSupabaseStub({
      deleteError: new Error("delete failed"),
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await expect(deleteAlertRuleForCurrentUser("rule-456")).rejects.toThrow(
      "delete failed"
    );
    expect(supabase.chains.deleteChain.eqFirst).toHaveBeenCalledWith("id", "rule-456");
    expect(supabase.chains.deleteChain.eqSecond).toHaveBeenCalledWith(
      "user_id",
      "user-123"
    );
  });
});
