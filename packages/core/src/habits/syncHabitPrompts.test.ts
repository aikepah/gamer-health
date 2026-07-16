import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { GameSessionRow } from "../sessions/startSession";
import type { HabitPromptRow } from "./respondToPrompt";
import type { HabitRow } from "./upsertHabit";
import { syncHabitPrompts } from "./syncHabitPrompts";

function makeHabitRow(overrides: Partial<HabitRow> = {}): HabitRow {
  return {
    id: "habit_1",
    userId: "user_1",
    kind: "hydrate",
    triggerType: "session_interval",
    enabled: true,
    config: {},
    createdAt: new Date(),
    updatedAt: new Date(),
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
    startedAt: new Date("2026-07-15T00:00:00Z"),
    endedAt: null,
    source: "manual",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePendingRow(
  overrides: Partial<HabitPromptRow> & {
    habit: HabitRow;
    session?: GameSessionRow | null;
  },
): HabitPromptRow & { habit: HabitRow; session: GameSessionRow | null } {
  return {
    id: "prompt_1",
    habitId: overrides.habit.id,
    userId: "user_1",
    sessionId: overrides.session?.id ?? null,
    dueAt: new Date("2026-07-15T09:00:00Z"),
    status: "pending",
    respondedAt: null,
    createdAt: new Date(),
    session: null,
    ...overrides,
  };
}

interface CtxOptions {
  userId: string | null;
  profileTimezone?: string | null;
  habits?: HabitRow[];
  activeSession?: GameSessionRow;
  pendingRows?: (HabitPromptRow & {
    habit: HabitRow;
    session: GameSessionRow | null;
  })[];
}

function makeCtx(options: CtxOptions): {
  ctx: ServiceCtx;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insertedBatches: unknown[][];
  updateCalls: { patch: unknown; where: unknown }[];
} {
  const profileFindFirst = vi.fn().mockResolvedValue({
    userId: options.userId,
    timezone: options.profileTimezone ?? "UTC",
    platforms: [],
    goals: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const habitFindMany = vi.fn().mockResolvedValue(options.habits ?? []);
  const sessionFindFirst = vi.fn().mockResolvedValue(options.activeSession);
  const promptFindMany = vi.fn().mockResolvedValue(options.pendingRows ?? []);

  const insertedBatches: unknown[][] = [];
  const insert = vi.fn().mockImplementation(() => ({
    values: (vals: unknown[]) => {
      insertedBatches.push(vals);
      return { onConflictDoNothing: () => Promise.resolve([]) };
    },
  }));

  const updateCalls: { patch: unknown; where: unknown }[] = [];
  const update = vi.fn().mockImplementation(() => ({
    set: (patch: unknown) => ({
      where: (cond: unknown) => {
        updateCalls.push({ patch, where: cond });
        return Promise.resolve([]);
      },
    }),
  }));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      Habit: { findMany: habitFindMany },
      GameSession: { findFirst: sessionFindFirst },
      HabitPrompt: { findMany: promptFindMany },
    },
    insert,
    update,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: options.userId },
    insert,
    update,
    insertedBatches,
    updateCalls,
  };
}

describe("syncHabitPrompts — generation", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx({ userId: null });
    await expect(syncHabitPrompts(ctx, {})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("generates session-interval occurrences up to now and stops there", async () => {
    const habit = makeHabitRow({
      id: "habit_break",
      kind: "break_interval",
      triggerType: "session_interval",
      config: { intervalMinutes: 50 },
    });
    // 125 minutes elapsed: k=1 (50m) and k=2 (100m) are due; k=3 (150m) is not.
    const session = makeSessionRow({
      startedAt: new Date("2026-07-15T08:00:00Z"),
    });
    const now = new Date("2026-07-15T10:05:00Z");

    const { ctx, insertedBatches } = makeCtx({
      userId: "user_1",
      habits: [habit],
      activeSession: session,
    });

    await syncHabitPrompts(ctx, { now });

    expect(insertedBatches).toHaveLength(1);
    const batch = insertedBatches[0] as {
      habitId: string;
      sessionId: string;
      dueAt: Date;
    }[];
    expect(batch).toHaveLength(2);
    expect(batch.map((c) => c.dueAt.toISOString())).toEqual([
      "2026-07-15T08:50:00.000Z",
      "2026-07-15T09:40:00.000Z",
    ]);
    expect(batch.every((c) => c.sessionId === "session_1")).toBe(true);
  });

  it("does not generate session-interval prompts without an active session", async () => {
    const habit = makeHabitRow({ triggerType: "session_interval" });
    const { ctx, insert } = makeCtx({ userId: "user_1", habits: [habit] });

    await syncHabitPrompts(ctx, { now: new Date("2026-07-15T10:00:00Z") });

    expect(insert).not.toHaveBeenCalled();
  });

  it("generates a daily_movement prompt once its time of day has passed, with no session required", async () => {
    const habit = makeHabitRow({
      id: "habit_movement",
      kind: "daily_movement",
      triggerType: "daily_schedule",
      config: { timeOfDay: "09:00" },
    });
    const { ctx, insertedBatches } = makeCtx({
      userId: "user_1",
      habits: [habit],
    });

    await syncHabitPrompts(ctx, { now: new Date("2026-07-15T10:00:00Z") });

    expect(insertedBatches).toHaveLength(1);
    const [candidate] = insertedBatches[0] as {
      sessionId: string | null;
      dueAt: Date;
    }[];
    expect(candidate?.sessionId).toBeNull();
    expect(candidate?.dueAt.toISOString()).toBe("2026-07-15T09:00:00.000Z");
  });

  it("does not generate daily_movement before its time of day", async () => {
    const habit = makeHabitRow({
      kind: "daily_movement",
      triggerType: "daily_schedule",
      config: { timeOfDay: "09:00" },
    });
    const { ctx, insert } = makeCtx({ userId: "user_1", habits: [habit] });

    await syncHabitPrompts(ctx, { now: new Date("2026-07-15T05:00:00Z") });

    expect(insert).not.toHaveBeenCalled();
  });

  it("generates bedtime_cutoff only when an active session is present and past due", async () => {
    const habit = makeHabitRow({
      id: "habit_bedtime",
      kind: "bedtime_cutoff",
      triggerType: "daily_schedule",
      config: { bedtime: "23:00", leadMinutes: 60 },
    });
    const now = new Date("2026-07-15T22:30:00Z"); // past the 22:00 due time

    const withSession = makeCtx({
      userId: "user_1",
      habits: [habit],
      activeSession: makeSessionRow(),
    });
    await syncHabitPrompts(withSession.ctx, { now });
    expect(withSession.insertedBatches).toHaveLength(1);
    const [candidate] = withSession.insertedBatches[0] as { dueAt: Date }[];
    expect(candidate?.dueAt.toISOString()).toBe("2026-07-15T22:00:00.000Z");

    const withoutSession = makeCtx({ userId: "user_1", habits: [habit] });
    await syncHabitPrompts(withoutSession.ctx, { now });
    expect(withoutSession.insert).not.toHaveBeenCalled();
  });

  it("falls back to UTC when the profile has no saved timezone", async () => {
    const habit = makeHabitRow({
      kind: "daily_movement",
      triggerType: "daily_schedule",
      config: { timeOfDay: "09:00" },
    });
    const { ctx, insertedBatches } = makeCtx({
      userId: "user_1",
      profileTimezone: null,
      habits: [habit],
    });

    await syncHabitPrompts(ctx, { now: new Date("2026-07-15T10:00:00Z") });

    const [candidate] = insertedBatches[0] as { dueAt: Date }[];
    expect(candidate?.dueAt.toISOString()).toBe("2026-07-15T09:00:00.000Z");
  });
});

describe("syncHabitPrompts — expiry and return shape", () => {
  it("expires a session-interval prompt once its session has ended, and excludes it from pending", async () => {
    const habit = makeHabitRow({
      id: "habit_hydrate",
      kind: "hydrate",
      triggerType: "session_interval",
    });
    const endedSession = makeSessionRow({
      id: "session_ended",
      endedAt: new Date("2026-07-15T09:30:00Z"),
    });
    const row = makePendingRow({
      id: "prompt_ended_session",
      habit,
      session: endedSession,
      dueAt: new Date("2026-07-15T09:00:00Z"),
    });

    const { ctx, updateCalls } = makeCtx({
      userId: "user_1",
      pendingRows: [row],
    });

    const result = await syncHabitPrompts(ctx, {
      now: new Date("2026-07-15T09:05:00Z"),
    });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.patch).toEqual({ status: "expired" });
    expect(result.pending).toHaveLength(0);
  });

  it("expires a bedtime_cutoff prompt once now is past dueAt + leadMinutes (i.e. past bedtime)", async () => {
    const habit = makeHabitRow({
      id: "habit_bedtime",
      kind: "bedtime_cutoff",
      triggerType: "daily_schedule",
      config: { bedtime: "23:00", leadMinutes: 60 },
    });
    // dueAt (22:00) + leadMinutes (60) = 23:00 (bedtime).
    const row = makePendingRow({
      id: "prompt_bedtime",
      habit,
      dueAt: new Date("2026-07-15T22:00:00Z"),
    });

    const past = await syncHabitPrompts(
      makeCtx({ userId: "user_1", pendingRows: [row] }).ctx,
      { now: new Date("2026-07-15T23:01:00Z") },
    );
    expect(past.pending).toHaveLength(0);

    const before = await syncHabitPrompts(
      makeCtx({ userId: "user_1", pendingRows: [row] }).ctx,
      { now: new Date("2026-07-15T22:30:00Z") },
    );
    expect(before.pending).toHaveLength(1);
  });

  it("expires a daily_movement prompt at the end of its local day", async () => {
    const habit = makeHabitRow({
      id: "habit_movement",
      kind: "daily_movement",
      triggerType: "daily_schedule",
      config: { timeOfDay: "09:00" },
    });
    const row = makePendingRow({
      id: "prompt_yesterday",
      habit,
      dueAt: new Date("2026-07-14T09:00:00Z"),
    });

    const result = await syncHabitPrompts(
      makeCtx({ userId: "user_1", pendingRows: [row] }).ctx,
      { now: new Date("2026-07-15T10:00:00Z") },
    );

    expect(result.pending).toHaveLength(0);
  });

  it("expires any pending prompt older than the 60-minute general backstop", async () => {
    const habit = makeHabitRow({
      id: "habit_hydrate",
      kind: "hydrate",
      triggerType: "session_interval",
    });
    const activeSession = makeSessionRow({ endedAt: null });
    const row = makePendingRow({
      id: "prompt_stale",
      habit,
      session: activeSession,
      dueAt: new Date("2026-07-15T08:00:00Z"),
    });

    const { ctx, updateCalls } = makeCtx({
      userId: "user_1",
      pendingRows: [row],
    });

    const result = await syncHabitPrompts(ctx, {
      now: new Date("2026-07-15T09:05:00Z"), // 65 minutes after dueAt
    });

    expect(updateCalls).toHaveLength(1);
    expect(result.pending).toHaveLength(0);
  });

  it("returns still-pending, due prompts sorted by dueAt asc, decorated with title/promptText", async () => {
    const hydrateHabit = makeHabitRow({
      id: "habit_hydrate",
      kind: "hydrate",
      triggerType: "session_interval",
    });
    const breakHabit = makeHabitRow({
      id: "habit_break",
      kind: "break_interval",
      triggerType: "session_interval",
    });
    const activeSession = makeSessionRow({ endedAt: null });

    const later = makePendingRow({
      id: "prompt_later",
      habit: breakHabit,
      session: activeSession,
      dueAt: new Date("2026-07-15T09:00:00Z"),
    });
    const earlier = makePendingRow({
      id: "prompt_earlier",
      habit: hydrateHabit,
      session: activeSession,
      dueAt: new Date("2026-07-15T08:45:00Z"),
    });

    const { ctx, updateCalls } = makeCtx({
      userId: "user_1",
      pendingRows: [later, earlier],
    });

    const result = await syncHabitPrompts(ctx, {
      now: new Date("2026-07-15T09:10:00Z"),
    });

    expect(updateCalls).toHaveLength(0);
    expect(result.pending.map((p) => p.id)).toEqual([
      "prompt_earlier",
      "prompt_later",
    ]);
    expect(result.pending[0]).toMatchObject({
      title: "Hydration Reminder",
      promptText: "Drink some water",
    });
    expect(result.pending[1]).toMatchObject({
      title: "Break Reminder",
      promptText: "Take a 5-minute break",
    });
  });

  it("excludes not-yet-due pending prompts from the result without expiring them", async () => {
    const habit = makeHabitRow({
      id: "habit_hydrate",
      kind: "hydrate",
      triggerType: "session_interval",
    });
    const activeSession = makeSessionRow({ endedAt: null });
    const futureRow = makePendingRow({
      id: "prompt_future",
      habit,
      session: activeSession,
      dueAt: new Date("2026-07-15T10:00:00Z"),
    });

    const { ctx, updateCalls } = makeCtx({
      userId: "user_1",
      pendingRows: [futureRow],
    });

    const result = await syncHabitPrompts(ctx, {
      now: new Date("2026-07-15T09:00:00Z"),
    });

    expect(updateCalls).toHaveLength(0);
    expect(result.pending).toHaveLength(0);
  });
});
