import { describe, expect, it, vi } from "vitest";

import { Game, GameSession } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import type { GameRow } from "../../sessions/games";
import { mergeGames } from "./mergeGames";

interface ProfileSnapshot {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

function makeRow(overrides: Partial<GameRow> = {}): GameRow {
  return {
    id: "game_source",
    name: "Rocket Leage",
    platform: "PC",
    steamAppId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeCtx(config: {
  actorProfile?: ProfileSnapshot;
  source?: GameRow;
  target?: GameRow;
  movedSessionIds?: string[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(config.actorProfile);
  const gameFindFirst = vi
    .fn()
    .mockResolvedValueOnce(config.source)
    .mockResolvedValueOnce(config.target);

  const auditInsertValues = vi.fn();
  const gameSessionUpdateSet = vi.fn();
  const gameUpdateSet = vi.fn();
  const gameDeleteWhere = vi.fn();

  const tx = {
    update: vi.fn((table: unknown) => {
      if (table === GameSession) {
        return {
          set: vi.fn((vals: Record<string, unknown>) => {
            gameSessionUpdateSet(vals);
            return {
              where: vi.fn().mockReturnValue({
                returning: vi
                  .fn()
                  .mockResolvedValue(
                    (config.movedSessionIds ?? []).map((id) => ({ id })),
                  ),
              }),
            };
          }),
        };
      }
      if (table === Game) {
        return {
          set: vi.fn((vals: Record<string, unknown>) => {
            gameUpdateSet(vals);
            return { where: vi.fn().mockResolvedValue(undefined) };
          }),
        };
      }
      throw new Error("unexpected update table in test");
    }),
    delete: vi.fn(() => ({
      where: vi.fn((cond: unknown) => {
        gameDeleteWhere(cond);
        return Promise.resolve(undefined);
      }),
    })),
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
    transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: "admin_1" } as ServiceCtx,
    auditInsertValues,
    gameSessionUpdateSet,
    gameUpdateSet,
    gameDeleteWhere,
  };
}

describe("mergeGames", () => {
  it("throws CoreError(FORBIDDEN) for a non-admin", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "player", deactivatedAt: null },
    });
    await expect(
      mergeGames(ctx, { sourceGameId: "a", targetGameId: "b" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(BAD_REQUEST) when source === target", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
    });
    await expect(
      mergeGames(ctx, { sourceGameId: "same", targetGameId: "same" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws CoreError(NOT_FOUND) when the source doesn't exist", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      source: undefined,
      target: makeRow({ id: "game_target" }),
    });
    await expect(
      mergeGames(ctx, {
        sourceGameId: "game_source",
        targetGameId: "game_target",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(NOT_FOUND) when the target doesn't exist", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      source: makeRow(),
      target: undefined,
    });
    await expect(
      mergeGames(ctx, {
        sourceGameId: "game_source",
        targetGameId: "game_target",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("repoints sessions, deletes the source, and audits game_merge", async () => {
    const source = makeRow({ id: "game_source", name: "Rocket Leage" });
    const target = makeRow({ id: "game_target", name: "Rocket League" });
    const { ctx, auditInsertValues, gameDeleteWhere, gameUpdateSet } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      source,
      target,
      movedSessionIds: ["session_1"],
    });

    const result = await mergeGames(ctx, {
      sourceGameId: "game_source",
      targetGameId: "game_target",
    });

    expect(result).toEqual({ movedSessions: 1 });
    expect(gameDeleteWhere).toHaveBeenCalled();
    expect(gameUpdateSet).not.toHaveBeenCalled(); // neither has a steamAppId
    expect(auditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin_1",
        action: "game_merge",
        meta: {
          sourceName: "Rocket Leage",
          targetName: "Rocket League",
          movedSessions: 1,
        },
      }),
    );
  });

  it("moves the source's steamAppId to the target when the target has none", async () => {
    const source = makeRow({ id: "game_source", steamAppId: 1245620 });
    const target = makeRow({ id: "game_target", steamAppId: null });
    const { ctx, gameUpdateSet } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      source,
      target,
    });

    await mergeGames(ctx, {
      sourceGameId: "game_source",
      targetGameId: "game_target",
    });

    expect(gameUpdateSet).toHaveBeenCalledWith({ steamAppId: 1245620 });
  });

  it("leaves the target's steamAppId untouched when both share the same id", async () => {
    const source = makeRow({ id: "game_source", steamAppId: 1245620 });
    const target = makeRow({ id: "game_target", steamAppId: 1245620 });
    const { ctx, gameUpdateSet } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      source,
      target,
    });

    await mergeGames(ctx, {
      sourceGameId: "game_source",
      targetGameId: "game_target",
    });

    expect(gameUpdateSet).not.toHaveBeenCalled();
  });

  it("throws CoreError(CONFLICT) before any write when both games have different steamAppIds", async () => {
    const source = makeRow({ id: "game_source", steamAppId: 111 });
    const target = makeRow({ id: "game_target", steamAppId: 222 });
    const { ctx, gameDeleteWhere, gameSessionUpdateSet } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      source,
      target,
    });

    await expect(
      mergeGames(ctx, {
        sourceGameId: "game_source",
        targetGameId: "game_target",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(gameSessionUpdateSet).not.toHaveBeenCalled();
    expect(gameDeleteWhere).not.toHaveBeenCalled();
  });
});
