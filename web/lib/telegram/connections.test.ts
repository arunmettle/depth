import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
  isSupabaseAdminConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  isTelegramConnectionConflictError,
  upsertTelegramConnection,
} from "@/lib/telegram/connections";

function createAdminStub(existingRow: Record<string, unknown> | null, upsertError: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: existingRow,
    error: null,
  });
  const eq = vi.fn(() => ({
    maybeSingle,
  }));
  const select = vi.fn(() => ({
    eq,
  }));
  const upsert = vi.fn().mockResolvedValue({
    error: upsertError,
  });
  const from = vi.fn(() => ({
    select,
    upsert,
  }));

  return {
    eq,
    from,
    maybeSingle,
    select,
    upsert,
  };
}

describe("telegram connections", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  it("preserves the original connected time when an existing user reconnects", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T08:40:00.000Z"));

    const adminStub = createAdminStub({
      connected_at: "2026-07-01T10:00:00.000Z",
      last_seen_at: "2026-07-05T09:00:00.000Z",
      telegram_chat_id: "12345",
      telegram_first_name: "Alex",
      telegram_username: "alextrades",
      user_id: "user-123",
    });
    vi.mocked(createAdminClient).mockReturnValue(adminStub as never);

    await upsertTelegramConnection("user-123", {
      chatId: "99999",
      firstName: "Alex",
      username: "flowtrader",
    });

    expect(adminStub.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        connected_at: "2026-07-01T10:00:00.000Z",
        last_seen_at: "2026-07-06T08:40:00.000Z",
        telegram_chat_id: "99999",
        telegram_username: "flowtrader",
        user_id: "user-123",
      }),
      { onConflict: "user_id" }
    );
  });

  it("uses the current timestamp for a first-time connection", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T08:41:00.000Z"));

    const adminStub = createAdminStub(null);
    vi.mocked(createAdminClient).mockReturnValue(adminStub as never);

    await upsertTelegramConnection("user-456", {
      chatId: "55555",
      firstName: "Sam",
      username: "samtrades",
    });

    expect(adminStub.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        connected_at: "2026-07-06T08:41:00.000Z",
        last_seen_at: "2026-07-06T08:41:00.000Z",
        telegram_chat_id: "55555",
        telegram_username: "samtrades",
        user_id: "user-456",
      }),
      { onConflict: "user_id" }
    );
  });

  it("detects unique-constraint conflicts from Supabase errors", () => {
    expect(isTelegramConnectionConflictError({ code: "23505" })).toBe(true);
    expect(isTelegramConnectionConflictError({ code: "other" })).toBe(false);
    expect(isTelegramConnectionConflictError(null)).toBe(false);
  });
});
