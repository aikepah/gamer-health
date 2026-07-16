import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { GameSessionRow } from "./startSession";

const recordRewardEvent = vi.fn().mockResolvedValue({ recorded: true });
vi.mock("../gamification/events", () => ({
  recordRewardEvent: (...args: unknown[]) =>
    (recordRewardEvent as (...a: unknown[]) => unknown)(...args),
}));

// Import after the mock so stopSession picks up the mocked module.
const { stopSession } = await import("./stopSession");

function makeRow(overrides: Partial<GameSessionRow> = {}): GameSessionRow {
  return {
    id: "session_1",
    userId: "user_1",
    gameId: "game_1",
    startedAt: new Date("2026-07-15T10:00:00Z"),
    endedAt: null,
    source: "manual",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCtx(options: {
  userId: string | null;
  activeSession?: GameSessionRow;
  updatedSession?: GameSessionRow[];
}): {
  ctx: ServiceCtx;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
} {
  const findFirst = vi.fn().mockResolvedValue(options.activeSession);

  const updateReturning = vi
    .fn()
    .mockResolvedValue(
      options.updatedSession ?? [makeRow({ endedAt: new Date() })],
    );
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set: updateSet });

  const insert = vi.fn();

  const db = {
    query: { GameSession: { findFirst } },
    update,
    insert,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: options.userId }, update, insert };
}

describe("stopSession", () => {
  beforeEach(() => {
    recordRewardEvent.mockClear();
  });

  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx({ userId: null });
    await expect(stopSession(ctx, {})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("throws CoreError(NOT_FOUND) when no session is active", async () => {
    const { ctx, update } = makeCtx({
      userId: "user_1",
      activeSession: undefined,
    });
    await expect(stopSession(ctx, {})).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("guarantees endedAt > startedAt even when stopped in the same instant", async () => {
    const active = makeRow({ startedAt: new Date() });
    const { ctx, update } = makeCtx({
      userId: "user_1",
      activeSession: active,
    });

    await stopSession(ctx, {});

    const setMock = (
      update.mock.results[0]?.value as { set: ReturnType<typeof vi.fn> }
    ).set;
    const setArg = setMock.mock.calls[0]?.[0] as { endedAt: Date };
    expect(setArg.endedAt.getTime()).toBeGreaterThan(
      active.startedAt.getTime(),
    );
  });

  it("sets endedAt and emits session_logged once", async () => {
    const active = makeRow();
    const stopped = makeRow({ endedAt: new Date("2026-07-15T11:00:00Z") });
    const { ctx } = makeCtx({
      userId: "user_1",
      activeSession: active,
      updatedSession: [stopped],
    });

    const result = await stopSession(ctx, {});

    expect(result).toBe(stopped);
    expect(recordRewardEvent).toHaveBeenCalledOnce();
    expect(recordRewardEvent).toHaveBeenCalledWith(ctx, {
      eventType: "session_logged",
      sourceId: stopped.id,
    });
  });
});
