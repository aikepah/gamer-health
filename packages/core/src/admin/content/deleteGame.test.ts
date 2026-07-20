import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import type { GameRow } from "../../sessions/games";
import { deleteGame } from "./deleteGame";

interface ProfileSnapshot {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

function makeRow(overrides: Partial<GameRow> = {}): GameRow {
  return {
    id: "game_1",
    name: "elden ring (steam)",
    platform: null,
    steamAppId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeCtx(config: {
  actorProfile?: ProfileSnapshot;
  existing?: GameRow;
  sessionCount?: number;
  coachGameCount?: number;
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(config.actorProfile);
  const gameFindFirst = vi.fn().mockResolvedValue(config.existing);

  // Called in order: game_session count, then coach_game count.
  const countSelectWhere = vi
    .fn()
    .mockResolvedValueOnce([{ value: config.sessionCount ?? 0 }])
    .mockResolvedValueOnce([{ value: config.coachGameCount ?? 0 }]);
  const select = vi.fn(() => ({
    from: vi.fn().mockReturnThis(),
    where: countSelectWhere,
  }));

  const auditInsertValues = vi.fn();
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const tx = {
    delete: vi.fn(() => ({ where: deleteWhere })),
    insert: vi.fn(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        auditInsertValues(vals);
        return Promise.resolve(undefined);
      }),
    })),
  };

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      Game: { findFirst: gameFindFirst },
    },
    select,
    transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: "admin_1" } as ServiceCtx,
    auditInsertValues,
    deleteWhere,
  };
}

describe("deleteGame", () => {
  it("throws CoreError(FORBIDDEN) for a non-admin", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "player", deactivatedAt: null },
    });
    await expect(deleteGame(ctx, { gameId: "game_1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws CoreError(NOT_FOUND) when the game doesn't exist", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing: undefined,
    });
    await expect(deleteGame(ctx, { gameId: "missing" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws CoreError(CONFLICT) suggesting merge when the game has logged sessions", async () => {
    const { ctx, deleteWhere } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing: makeRow(),
      sessionCount: 2,
    });
    await expect(deleteGame(ctx, { gameId: "game_1" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("merge") as string,
    });
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it("throws CoreError(CONFLICT) suggesting merge when coaches list this game", async () => {
    const { ctx, deleteWhere } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing: makeRow(),
      sessionCount: 0,
      coachGameCount: 1,
    });
    await expect(deleteGame(ctx, { gameId: "game_1" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("merge") as string,
    });
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it("deletes the game and audits game_delete when there are zero sessions", async () => {
    const existing = makeRow({ name: "elden ring (steam)" });
    const { ctx, auditInsertValues, deleteWhere } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing,
      sessionCount: 0,
    });

    await deleteGame(ctx, { gameId: "game_1" });

    expect(deleteWhere).toHaveBeenCalled();
    expect(auditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin_1",
        action: "game_delete",
        meta: { name: "elden ring (steam)" },
      }),
    );
  });
});
