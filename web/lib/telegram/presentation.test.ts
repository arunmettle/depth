import { describe, expect, it } from "vitest";

import {
  formatTelegramTimestampUtc,
  getTelegramConnectionFacts,
} from "@/lib/telegram/presentation";

describe("telegram presentation helpers", () => {
  it("formats telegram timestamps in a deterministic UTC display", () => {
    expect(formatTelegramTimestampUtc("2026-07-06T08:40:00.000Z")).toBe(
      "Jul 06, 2026 08:40 UTC"
    );
  });

  it("returns unknown for invalid timestamps", () => {
    expect(formatTelegramTimestampUtc("not-a-date")).toBe("Unknown");
  });

  it("maps a connection into connected and last-seen facts", () => {
    expect(
      getTelegramConnectionFacts({
        connectedAt: "2026-07-01T10:00:00.000Z",
        firstName: "Alex",
        lastSeenAt: "2026-07-06T08:40:00.000Z",
        telegramChatId: "12345",
        telegramUsername: "alextrades",
        userId: "user-123",
      })
    ).toEqual([
      {
        label: "Connected",
        value: "Jul 01, 2026 10:00 UTC",
      },
      {
        label: "Last seen",
        value: "Jul 06, 2026 08:40 UTC",
      },
    ]);
  });
});
