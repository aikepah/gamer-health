import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { GameRow } from "./games";
import { CoreError } from "../lib/errors";
import { getOrCreateGame, searchGames } from "./games";

function makeRow(overrides: Partial<GameRow> = {}): GameRow {
  return {
    id: "game_1",
    name: "Elden Ring",
    platform: "PC",
    steamAppId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("searchGames", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const findMany = vi.fn();
    const db = { query: { Game: { findMany } } } as unknown as ServiceCtx["db"];
    await expect(
      searchGames({ db, userId: null }, { query: "", limit: 10 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns catalog matches ordered by name", async () => {
    const rows = [makeRow()];
    const findMany = vi.fn().mockResolvedValue(rows);
    const db = { query: { Game: { findMany } } } as unknown as ServiceCtx["db"];

    const result = await searchGames(
      { db, userId: "user_1" },
      { query: "elden", limit: 10 },
    );

    expect(result).toBe(rows);
    expect(findMany).toHaveBeenCalledOnce();
  });
});

describe("getOrCreateGame", () => {
  function makeCtx(options: {
    findFirstResults: (GameRow | undefined)[];
    insertReturning?: GameRow[];
  }): { ctx: ServiceCtx; insert: ReturnType<typeof vi.fn> } {
    const findFirst = vi.fn();
    options.findFirstResults.forEach((r) => findFirst.mockResolvedValueOnce(r));

    const returning = vi.fn().mockResolvedValue(options.insertReturning ?? []);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    const db = {
      query: { Game: { findFirst } },
      insert,
    } as unknown as ServiceCtx["db"];

    return { ctx: { db, userId: "user_1" }, insert };
  }

  it("returns the existing game without inserting on a case-insensitive match", async () => {
    const existing = makeRow();
    const { ctx, insert } = makeCtx({ findFirstResults: [existing] });

    const result = await getOrCreateGame(ctx, { name: "elden ring" });

    expect(result).toBe(existing);
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates a new game when no match exists", async () => {
    const created = makeRow({ id: "game_2", name: "New Game" });
    const { ctx } = makeCtx({
      findFirstResults: [undefined],
      insertReturning: [created],
    });

    const result = await getOrCreateGame(ctx, { name: "New Game" });

    expect(result).toBe(created);
  });

  it("re-selects when a concurrent request won the insert race", async () => {
    const raced = makeRow({ id: "game_3", name: "Raced Game" });
    const { ctx, insert } = makeCtx({
      findFirstResults: [undefined, raced],
      insertReturning: [],
    });

    const result = await getOrCreateGame(ctx, { name: "Raced Game" });

    expect(insert).toHaveBeenCalledOnce();
    expect(result).toBe(raced);
  });

  it("throws CoreError(NOT_FOUND) if the race fallback also finds nothing", async () => {
    const { ctx } = makeCtx({
      findFirstResults: [undefined, undefined],
      insertReturning: [],
    });
    await expect(
      getOrCreateGame(ctx, { name: "Ghost Game" }),
    ).rejects.toThrowError(CoreError);
  });
});
