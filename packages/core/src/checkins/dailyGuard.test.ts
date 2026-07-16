import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { CheckinRow } from "./dailyGuard";
import { findTodayDailyCheckin } from "./dailyGuard";

function makeCheckinRow(overrides: Partial<CheckinRow> = {}): CheckinRow {
  return {
    id: "checkin_1",
    userId: "user_1",
    context: "daily",
    sessionId: null,
    mood: 3,
    energy: null,
    sleepQuality: null,
    note: null,
    createdAt: new Date("2026-07-15T12:00:00Z"),
    ...overrides,
  };
}

function makeCtx(options: {
  profileTimezone?: string | null;
  mostRecentDaily?: CheckinRow;
}): { ctx: ServiceCtx; findFirst: ReturnType<typeof vi.fn> } {
  const profileFindFirst = vi.fn().mockResolvedValue({
    userId: "user_1",
    timezone: options.profileTimezone ?? "UTC",
    platforms: [],
    goals: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const findFirst = vi.fn().mockResolvedValue(options.mostRecentDaily);

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      Checkin: { findFirst },
    },
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "user_1" }, findFirst };
}

describe("findTodayDailyCheckin", () => {
  it("returns null when the caller has no daily check-in yet", async () => {
    const { ctx } = makeCtx({ mostRecentDaily: undefined });
    const result = await findTodayDailyCheckin(
      ctx,
      "user_1",
      new Date("2026-07-15T12:00:00Z"),
    );
    expect(result).toBeNull();
  });

  it("returns the row when the most recent daily check-in was today (UTC)", async () => {
    const row = makeCheckinRow({
      createdAt: new Date("2026-07-15T08:00:00Z"),
    });
    const { ctx } = makeCtx({ mostRecentDaily: row });
    const result = await findTodayDailyCheckin(
      ctx,
      "user_1",
      new Date("2026-07-15T20:00:00Z"),
    );
    expect(result).toBe(row);
  });

  it("returns null when the most recent daily check-in was yesterday (UTC)", async () => {
    const row = makeCheckinRow({
      createdAt: new Date("2026-07-14T23:00:00Z"),
    });
    const { ctx } = makeCtx({ mostRecentDaily: row });
    const result = await findTodayDailyCheckin(
      ctx,
      "user_1",
      new Date("2026-07-15T01:00:00Z"),
    );
    expect(result).toBeNull();
  });

  it("is timezone-sensitive: a late-UTC-night check-in counts as 'today' in a western timezone", async () => {
    // 2026-07-16T03:00:00Z is still 2026-07-15 22:00 in America/Chicago (UTC-5).
    const row = makeCheckinRow({
      createdAt: new Date("2026-07-16T03:00:00Z"),
    });
    const { ctx } = makeCtx({
      mostRecentDaily: row,
      profileTimezone: "America/Chicago",
    });
    // "now" is 2026-07-16T04:00:00Z == 2026-07-15 23:00 local — same local day.
    const result = await findTodayDailyCheckin(
      ctx,
      "user_1",
      new Date("2026-07-16T04:00:00Z"),
    );
    expect(result).toBe(row);
  });

  it("is timezone-sensitive: the same instant can be 'yesterday' in an eastern timezone", async () => {
    // 2026-07-16T03:00:00Z is already 2026-07-16 in Asia/Tokyo (UTC+9).
    const row = makeCheckinRow({
      createdAt: new Date("2026-07-15T03:00:00Z"), // 2026-07-15 12:00 JST
    });
    const { ctx } = makeCtx({
      mostRecentDaily: row,
      profileTimezone: "Asia/Tokyo",
    });
    // "now" is 2026-07-16T01:00:00Z == 2026-07-16 10:00 JST — next local day.
    const result = await findTodayDailyCheckin(
      ctx,
      "user_1",
      new Date("2026-07-16T01:00:00Z"),
    );
    expect(result).toBeNull();
  });

  it("defaults timezone to UTC when the profile has none set", async () => {
    const row = makeCheckinRow({
      createdAt: new Date("2026-07-15T08:00:00Z"),
    });
    const { ctx } = makeCtx({ mostRecentDaily: row, profileTimezone: null });
    const result = await findTodayDailyCheckin(
      ctx,
      "user_1",
      new Date("2026-07-15T20:00:00Z"),
    );
    expect(result).toBe(row);
  });
});
