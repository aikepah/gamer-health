import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { CheckinRow } from "./dailyGuard";
import { getTodayCheckinStatus } from "./getTodayStatus";

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
    createdAt: new Date(),
    ...overrides,
  };
}

function makeCtx(options: {
  userId: string | null;
  mostRecentDaily?: CheckinRow;
  profileTimezone?: string | null;
}): { ctx: ServiceCtx; findFirst: ReturnType<typeof vi.fn> } {
  const profileFindFirst = vi.fn().mockResolvedValue({
    userId: options.userId,
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

  return { ctx: { db, userId: options.userId }, findFirst };
}

describe("getTodayCheckinStatus", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx, findFirst } = makeCtx({ userId: null });
    await expect(getTodayCheckinStatus(ctx)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("returns hasDaily: false when there is no daily check-in yet", async () => {
    const { ctx } = makeCtx({ userId: "user_1", mostRecentDaily: undefined });
    await expect(getTodayCheckinStatus(ctx)).resolves.toEqual({
      hasDaily: false,
    });
  });

  it("returns hasDaily: false when the most recent daily check-in was yesterday", async () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const { ctx } = makeCtx({
      userId: "user_1",
      mostRecentDaily: makeCheckinRow({ createdAt: yesterday }),
    });
    await expect(getTodayCheckinStatus(ctx)).resolves.toEqual({
      hasDaily: false,
    });
  });

  it("returns hasDaily: true when today's daily check-in exists", async () => {
    const { ctx } = makeCtx({
      userId: "user_1",
      mostRecentDaily: makeCheckinRow({ createdAt: new Date() }),
    });
    await expect(getTodayCheckinStatus(ctx)).resolves.toEqual({
      hasDaily: true,
    });
  });
});
