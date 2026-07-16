import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { GameSessionRow } from "./startSession";
import { CoreError } from "../lib/errors";
import { logSession } from "./logSession";

function makeRow(overrides: Partial<GameSessionRow> = {}): GameSessionRow {
  return {
    id: "session_1",
    userId: "user_1",
    gameId: "game_1",
    startedAt: new Date("2026-07-14T10:00:00Z"),
    endedAt: new Date("2026-07-14T11:00:00Z"),
    source: "manual",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCtx(options: {
  userId: string | null;
  sessionInsertReturning?: GameSessionRow[];
  rewardRows?: { id: string }[];
}): {
  ctx: ServiceCtx;
  insert: ReturnType<typeof vi.fn>;
} {
  const sessionReturning = vi
    .fn()
    .mockResolvedValue(options.sessionInsertReturning ?? [makeRow()]);
  const sessionValues = vi
    .fn()
    .mockReturnValue({ returning: sessionReturning });

  const rewardReturning = vi
    .fn()
    .mockResolvedValue(options.rewardRows ?? [{ id: "reward_1" }]);
  const onConflictDoNothing = vi
    .fn()
    .mockReturnValue({ returning: rewardReturning });
  const rewardValues = vi.fn().mockReturnValue({ onConflictDoNothing });

  const insert = vi
    .fn()
    .mockReturnValueOnce({ values: sessionValues })
    .mockReturnValueOnce({ values: rewardValues });

  const db = { insert } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: options.userId }, insert };
}

const baseInput = {
  gameId: "game_1",
  startedAt: new Date("2026-07-14T10:00:00Z"),
  endedAt: new Date("2026-07-14T11:00:00Z"),
};

describe("logSession", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx({ userId: null });
    await expect(logSession(ctx, baseInput)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("throws CoreError(BAD_REQUEST) when endedAt is not after startedAt", async () => {
    const { ctx, insert } = makeCtx({ userId: "user_1" });
    await expect(
      logSession(ctx, {
        gameId: "game_1",
        startedAt: new Date("2026-07-14T11:00:00Z"),
        endedAt: new Date("2026-07-14T11:00:00Z"),
      }),
    ).rejects.toThrowError(CoreError);
    expect(insert).not.toHaveBeenCalled();
  });

  it("throws CoreError(BAD_REQUEST) when endedAt is in the future", async () => {
    const { ctx } = makeCtx({ userId: "user_1" });
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
    await expect(
      logSession(ctx, {
        gameId: "game_1",
        startedAt: new Date(),
        endedAt: farFuture,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("inserts the completed session and emits session_logged", async () => {
    const created = makeRow({ id: "session_9" });
    const { ctx, insert } = makeCtx({
      userId: "user_1",
      sessionInsertReturning: [created],
    });

    const result = await logSession(ctx, {
      ...baseInput,
      notes: "grinded a boss",
    });

    expect(result).toBe(created);
    expect(insert).toHaveBeenCalledTimes(2);
    const rewardValuesFn = (
      insert.mock.results[1]?.value as { values: (v: unknown) => unknown }
    ).values;
    expect(rewardValuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "session_logged",
        sourceKind: "game_session",
        sourceId: created.id,
      }),
    );
  });
});
