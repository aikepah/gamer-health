import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { GameSessionRow } from "../sessions/startSession";
import type { CheckinRow } from "./dailyGuard";

const recordRewardEvent = vi.fn().mockResolvedValue({ recorded: true });
vi.mock("../gamification/events", () => ({
  recordRewardEvent: (...args: unknown[]) =>
    (recordRewardEvent as (...a: unknown[]) => unknown)(...args),
}));

// Import after the mock so createCheckin picks up the mocked module.
const { createCheckin } = await import("./createCheckin");

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

function makeSessionRow(
  overrides: Partial<GameSessionRow> = {},
): GameSessionRow {
  return {
    id: "session_1",
    userId: "user_1",
    gameId: "game_1",
    startedAt: new Date("2026-07-15T10:00:00Z"),
    endedAt: new Date("2026-07-15T11:00:00Z"),
    source: "manual",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

interface CtxOptions {
  userId: string | null;
  profileTimezone?: string | null;
  mostRecentDaily?: CheckinRow;
  session?: GameSessionRow;
  existingPostSessionCheckin?: CheckinRow;
  insertReturning?: CheckinRow[];
}

function makeCtx(options: CtxOptions): {
  ctx: ServiceCtx;
  insert: ReturnType<typeof vi.fn>;
  checkinFindFirst: ReturnType<typeof vi.fn>;
} {
  const profileFindFirst = vi.fn().mockResolvedValue({
    userId: options.userId,
    timezone: options.profileTimezone ?? "UTC",
    platforms: [],
    goals: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const sessionFindFirst = vi.fn().mockResolvedValue(options.session);

  // Only one of these queries ever runs per `createCheckin` call: the daily
  // guard (`findTodayDailyCheckin`) for `context: "daily"`, or the
  // post_session dedupe check for `context: "post_session"` — never both.
  const checkinFindFirst = vi
    .fn()
    .mockResolvedValue(
      options.mostRecentDaily ?? options.existingPostSessionCheckin,
    );

  const returning = vi
    .fn()
    .mockResolvedValue(options.insertReturning ?? [makeCheckinRow()]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      Checkin: { findFirst: checkinFindFirst },
      GameSession: { findFirst: sessionFindFirst },
    },
    insert,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: options.userId }, insert, checkinFindFirst };
}

describe("createCheckin", () => {
  beforeEach(() => {
    recordRewardEvent.mockClear();
  });

  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx, insert } = makeCtx({ userId: null });
    await expect(
      createCheckin(ctx, { context: "daily", mood: 3 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(insert).not.toHaveBeenCalled();
  });

  describe("context: daily", () => {
    it("throws CoreError(CONFLICT) when a daily check-in already exists today", async () => {
      const { ctx, insert } = makeCtx({
        userId: "user_1",
        mostRecentDaily: makeCheckinRow({ createdAt: new Date() }),
      });
      await expect(
        createCheckin(ctx, { context: "daily", mood: 4 }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(insert).not.toHaveBeenCalled();
    });

    it("succeeds when the most recent daily check-in was on a previous local day", async () => {
      const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const created = makeCheckinRow({ id: "checkin_new" });
      const { ctx } = makeCtx({
        userId: "user_1",
        mostRecentDaily: makeCheckinRow({ createdAt: yesterday }),
        insertReturning: [created],
      });
      const result = await createCheckin(ctx, {
        context: "daily",
        mood: 4,
        energy: 3,
        sleepQuality: 5,
      });
      expect(result).toBe(created);
      expect(recordRewardEvent).toHaveBeenCalledWith(ctx, {
        eventType: "checkin_completed",
        sourceId: created.id,
      });
    });

    it("succeeds on the caller's first ever check-in (no prior daily row)", async () => {
      const created = makeCheckinRow({ id: "checkin_first" });
      const { ctx } = makeCtx({
        userId: "user_1",
        mostRecentDaily: undefined,
        insertReturning: [created],
      });
      const result = await createCheckin(ctx, { context: "daily", mood: 5 });
      expect(result).toBe(created);
    });

    it("ignores a client-supplied sessionId for daily check-ins", async () => {
      const created = makeCheckinRow({ id: "checkin_ignored_session" });
      const { ctx, insert } = makeCtx({
        userId: "user_1",
        mostRecentDaily: undefined,
        insertReturning: [created],
      });
      await createCheckin(ctx, {
        context: "daily",
        mood: 3,
        sessionId: "session_should_be_ignored",
      });
      const insertedValues = insert.mock.results[0]?.value as {
        values: ReturnType<typeof vi.fn>;
      };
      const valuesArg = insertedValues.values.mock.calls[0]?.[0] as {
        sessionId: string | null;
      };
      expect(valuesArg.sessionId).toBeNull();
    });
  });

  describe("context: post_session", () => {
    it("throws CoreError(BAD_REQUEST) when sessionId is missing", async () => {
      const { ctx, insert } = makeCtx({ userId: "user_1" });
      await expect(
        createCheckin(ctx, { context: "post_session", mood: 3 }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(insert).not.toHaveBeenCalled();
    });

    it("throws CoreError(NOT_FOUND) when the session doesn't belong to the caller", async () => {
      const { ctx, insert } = makeCtx({ userId: "user_1", session: undefined });
      await expect(
        createCheckin(ctx, {
          context: "post_session",
          sessionId: "session_1",
          mood: 3,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(insert).not.toHaveBeenCalled();
    });

    it("throws CoreError(CONFLICT) when the session already has a post_session check-in", async () => {
      const session = makeSessionRow();
      const { ctx, insert } = makeCtx({
        userId: "user_1",
        session,
        existingPostSessionCheckin: makeCheckinRow({
          context: "post_session",
          sessionId: session.id,
        }),
      });
      await expect(
        createCheckin(ctx, {
          context: "post_session",
          sessionId: session.id,
          mood: 3,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(insert).not.toHaveBeenCalled();
    });

    it("creates the check-in, links the session, and emits checkin_completed", async () => {
      const session = makeSessionRow();
      const created = makeCheckinRow({
        id: "checkin_post_session",
        context: "post_session",
        sessionId: session.id,
      });
      const { ctx, insert } = makeCtx({
        userId: "user_1",
        session,
        existingPostSessionCheckin: undefined,
        insertReturning: [created],
      });

      const result = await createCheckin(ctx, {
        context: "post_session",
        sessionId: session.id,
        mood: 2,
        note: "Long session, pretty drained.",
      });

      expect(result).toBe(created);
      const insertedValues = insert.mock.results[0]?.value as {
        values: ReturnType<typeof vi.fn>;
      };
      const valuesArg = insertedValues.values.mock.calls[0]?.[0] as {
        sessionId: string | null;
      };
      expect(valuesArg.sessionId).toBe(session.id);
      expect(recordRewardEvent).toHaveBeenCalledWith(ctx, {
        eventType: "checkin_completed",
        sourceId: created.id,
      });
    });
  });

  it("throws CoreError(CONFLICT) if the insert unexpectedly returns nothing", async () => {
    const { ctx } = makeCtx({
      userId: "user_1",
      mostRecentDaily: undefined,
      insertReturning: [],
    });
    await expect(
      createCheckin(ctx, { context: "daily", mood: 3 }),
    ).rejects.toThrowError(/check-in/i);
    expect(recordRewardEvent).not.toHaveBeenCalled();
  });
});
