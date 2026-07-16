import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { HabitPromptRow } from "./respondToPrompt";
import type { HabitRow } from "./upsertHabit";

const recordRewardEvent = vi.fn().mockResolvedValue({ recorded: true });
vi.mock("../gamification/events", () => ({
  recordRewardEvent: (...args: unknown[]) =>
    (recordRewardEvent as (...a: unknown[]) => unknown)(...args),
}));

// Import after the mock so respondToPrompt picks up the mocked module.
const { respondToPrompt } = await import("./respondToPrompt");

function makeHabitRow(overrides: Partial<HabitRow> = {}): HabitRow {
  return {
    id: "habit_1",
    userId: "user_1",
    kind: "hydrate",
    triggerType: "session_interval",
    enabled: true,
    config: { intervalMinutes: 30 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePromptRow(
  overrides: Partial<HabitPromptRow> = {},
): HabitPromptRow {
  return {
    id: "prompt_1",
    habitId: "habit_1",
    userId: "user_1",
    sessionId: "session_1",
    dueAt: new Date("2026-07-15T10:00:00Z"),
    status: "pending",
    respondedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeCtx(options: {
  userId: string | null;
  found?: (HabitPromptRow & { habit: HabitRow }) | undefined;
  updated?: HabitPromptRow[];
}): {
  ctx: ServiceCtx;
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
} {
  const findFirst = vi.fn().mockResolvedValue(options.found);
  const returning = vi
    .fn()
    .mockResolvedValue(options.updated ?? [makePromptRow({ status: "done" })]);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });

  const db = {
    query: { HabitPrompt: { findFirst } },
    update,
  } as unknown as ServiceCtx["db"];
  return { ctx: { db, userId: options.userId }, findFirst, update };
}

describe("respondToPrompt", () => {
  beforeEach(() => {
    recordRewardEvent.mockClear();
  });

  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx({ userId: null });
    await expect(
      respondToPrompt(ctx, { promptId: "prompt_1", response: "done" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws CoreError(NOT_FOUND) when the prompt doesn't exist or isn't the caller's", async () => {
    const { ctx } = makeCtx({ userId: "user_1", found: undefined });
    await expect(
      respondToPrompt(ctx, { promptId: "prompt_1", response: "done" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(CONFLICT) when the prompt isn't pending", async () => {
    const found = {
      ...makePromptRow({ status: "done" }),
      habit: makeHabitRow(),
    };
    const { ctx } = makeCtx({ userId: "user_1", found });
    await expect(
      respondToPrompt(ctx, { promptId: "prompt_1", response: "done" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("marks done, sets respondedAt, and emits habit_prompt_completed with meta.habitKind", async () => {
    const habit = makeHabitRow({ kind: "hydrate" });
    const found = { ...makePromptRow(), habit };
    const updated = makePromptRow({ status: "done", respondedAt: new Date() });
    const { ctx, update } = makeCtx({
      userId: "user_1",
      found,
      updated: [updated],
    });

    const result = await respondToPrompt(ctx, {
      promptId: "prompt_1",
      response: "done",
    });

    expect(result).toBe(updated);
    const setArg = (
      update.mock.results[0]?.value as { set: ReturnType<typeof vi.fn> }
    ).set.mock.calls[0]?.[0] as { status: string; respondedAt: Date };
    expect(setArg.status).toBe("done");
    expect(setArg.respondedAt).toBeInstanceOf(Date);

    expect(recordRewardEvent).toHaveBeenCalledOnce();
    expect(recordRewardEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        eventType: "habit_prompt_completed",
        sourceId: updated.id,
        meta: { habitKind: "hydrate" },
      }),
    );
  });

  it("marks skipped without emitting a reward event", async () => {
    const habit = makeHabitRow();
    const found = { ...makePromptRow(), habit };
    const updated = makePromptRow({
      status: "skipped",
      respondedAt: new Date(),
    });
    const { ctx } = makeCtx({ userId: "user_1", found, updated: [updated] });

    const result = await respondToPrompt(ctx, {
      promptId: "prompt_1",
      response: "skipped",
    });

    expect(result).toBe(updated);
    expect(recordRewardEvent).not.toHaveBeenCalled();
  });
});
