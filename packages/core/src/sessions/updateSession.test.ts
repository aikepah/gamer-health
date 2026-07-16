import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { GameSessionRow } from "./startSession";
import { CoreError } from "../lib/errors";
import { updateSession } from "./updateSession";

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
  existing?: GameSessionRow;
  updateReturning?: GameSessionRow[];
}): { ctx: ServiceCtx; update: ReturnType<typeof vi.fn> } {
  const findFirst = vi.fn().mockResolvedValue(options.existing);

  const returning = vi
    .fn()
    .mockResolvedValue(options.updateReturning ?? [makeRow()]);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });

  const db = {
    query: { GameSession: { findFirst } },
    update,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: options.userId }, update };
}

describe("updateSession", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx({ userId: null });
    await expect(updateSession(ctx, { id: "session_1" })).rejects.toMatchObject(
      { code: "UNAUTHORIZED" },
    );
  });

  it("throws CoreError(NOT_FOUND) when the session doesn't belong to the caller", async () => {
    const { ctx } = makeCtx({ userId: "user_1", existing: undefined });
    await expect(updateSession(ctx, { id: "session_1" })).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
  });

  it("throws CoreError(BAD_REQUEST) when the session is still active", async () => {
    const { ctx, update } = makeCtx({
      userId: "user_1",
      existing: makeRow({ endedAt: null }),
    });
    await expect(updateSession(ctx, { id: "session_1" })).rejects.toMatchObject(
      { code: "BAD_REQUEST" },
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("throws CoreError(BAD_REQUEST) when the resulting times are invalid", async () => {
    const { ctx } = makeCtx({
      userId: "user_1",
      existing: makeRow(),
    });
    await expect(
      updateSession(ctx, {
        id: "session_1",
        startedAt: new Date("2026-07-14T12:00:00Z"), // after existing endedAt
      }),
    ).rejects.toThrowError(CoreError);
  });

  it("updates only the provided fields, falling back to existing values", async () => {
    const existing = makeRow({ notes: "old notes" });
    const updated = makeRow({ notes: "new notes" });
    const { ctx, update } = makeCtx({
      userId: "user_1",
      existing,
      updateReturning: [updated],
    });

    const result = await updateSession(ctx, {
      id: "session_1",
      notes: "new notes",
    });

    expect(result).toBe(updated);
    const setFn = (
      update.mock.results[0]?.value as { set: (v: unknown) => unknown }
    ).set;
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: existing.gameId,
        startedAt: existing.startedAt,
        endedAt: existing.endedAt,
        notes: "new notes",
      }),
    );
  });

  it("clears notes when explicitly set to null", async () => {
    const existing = makeRow({ notes: "old notes" });
    const { ctx, update } = makeCtx({ userId: "user_1", existing });

    await updateSession(ctx, { id: "session_1", notes: null });

    const setFn = (
      update.mock.results[0]?.value as { set: (v: unknown) => unknown }
    ).set;
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ notes: null }),
    );
  });
});
