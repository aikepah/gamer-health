import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import type { GameRow } from "../../sessions/games";
import { renameGame } from "./renameGame";

interface ProfileSnapshot {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

function makeRow(overrides: Partial<GameRow> = {}): GameRow {
  return {
    id: "game_1",
    name: "Rocket Leage",
    platform: "PC",
    steamAppId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeCtx(config: {
  actorProfile?: ProfileSnapshot;
  existing?: GameRow;
  updateResult?: GameRow[] | (() => Promise<GameRow[]>);
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(config.actorProfile);
  const gameFindFirst = vi.fn().mockResolvedValue(config.existing);

  const auditInsertValues = vi.fn();
  const insert = vi.fn(() => ({
    values: vi.fn((vals: Record<string, unknown>) => {
      auditInsertValues(vals);
      return Promise.resolve(undefined);
    }),
  }));

  const returning =
    typeof config.updateResult === "function"
      ? config.updateResult
      : vi.fn().mockResolvedValue(config.updateResult ?? []);
  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({ returning })),
    })),
  }));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      Game: { findFirst: gameFindFirst },
    },
    update,
    insert,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "admin_1" } as ServiceCtx, auditInsertValues };
}

describe("renameGame", () => {
  it("throws CoreError(FORBIDDEN) for a non-admin", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "player", deactivatedAt: null },
    });
    await expect(
      renameGame(ctx, { gameId: "game_1", name: "New Name" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(NOT_FOUND) when the game doesn't exist", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing: undefined,
    });
    await expect(
      renameGame(ctx, { gameId: "missing", name: "New Name" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("renames the game and records a game_rename audit row with from/to", async () => {
    const existing = makeRow({ name: "Rocket Leage" });
    const updated = makeRow({ name: "Rocket League" });
    const { ctx, auditInsertValues } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing,
      updateResult: [updated],
    });

    const result = await renameGame(ctx, {
      gameId: "game_1",
      name: "Rocket League",
    });

    expect(result).toEqual(updated);
    expect(auditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin_1",
        action: "game_rename",
        meta: { from: "Rocket Leage", to: "Rocket League" },
      }),
    );
  });

  it("maps a unique-violation on the case-insensitive name index to CoreError(CONFLICT)", async () => {
    const existing = makeRow();
    const uniqueViolation = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });
    const { ctx, auditInsertValues } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing,
      updateResult: () => Promise.reject(uniqueViolation),
    });

    await expect(
      renameGame(ctx, { gameId: "game_1", name: "Elden Ring" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("merge instead") as string,
    });
    expect(auditInsertValues).not.toHaveBeenCalled();
  });
});
