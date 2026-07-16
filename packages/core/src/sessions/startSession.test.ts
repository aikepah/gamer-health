import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { GameSessionRow } from "./startSession";
import { CoreError } from "../lib/errors";
import { startSession } from "./startSession";

function makeRow(overrides: Partial<GameSessionRow> = {}): GameSessionRow {
  return {
    id: "session_1",
    userId: "user_1",
    gameId: "game_1",
    startedAt: new Date(),
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
  insertReturning?: GameSessionRow[];
  insertError?: Error;
}): { ctx: ServiceCtx; insert: ReturnType<typeof vi.fn> } {
  const findFirst = vi.fn().mockResolvedValue(options.activeSession);
  const returning = options.insertError
    ? vi.fn().mockRejectedValue(options.insertError)
    : vi.fn().mockResolvedValue(options.insertReturning ?? [makeRow()]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });

  const db = {
    query: { GameSession: { findFirst } },
    insert,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: options.userId }, insert };
}

describe("startSession", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx({ userId: null });
    await expect(startSession(ctx, { gameId: "game_1" })).rejects.toMatchObject(
      { code: "UNAUTHORIZED" },
    );
  });

  it("throws CoreError(CONFLICT) when an active session already exists", async () => {
    const { ctx, insert } = makeCtx({
      userId: "user_1",
      activeSession: makeRow(),
    });
    await expect(startSession(ctx, { gameId: "game_1" })).rejects.toMatchObject(
      { code: "CONFLICT" },
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts a new session with endedAt null and source manual", async () => {
    const created = makeRow({ id: "session_2" });
    const { ctx } = makeCtx({
      userId: "user_1",
      activeSession: undefined,
      insertReturning: [created],
    });

    const result = await startSession(ctx, {
      gameId: "game_1",
      notes: "co-op run",
    });

    expect(result).toBe(created);
  });

  it("maps a unique-violation race (23505, wrapped) to CoreError(CONFLICT)", async () => {
    // Drizzle wraps driver errors; the postgres error sits on `cause`.
    const pgError = Object.assign(new Error("duplicate key value"), {
      code: "23505",
    });
    const wrapped = new Error("Failed query", { cause: pgError });
    const { ctx } = makeCtx({
      userId: "user_1",
      activeSession: undefined,
      insertError: wrapped,
    });
    await expect(startSession(ctx, { gameId: "game_1" })).rejects.toMatchObject(
      { code: "CONFLICT" },
    );
  });

  it("rethrows non-unique insert errors unchanged", async () => {
    const dbDown = new Error("connection refused");
    const { ctx } = makeCtx({
      userId: "user_1",
      activeSession: undefined,
      insertError: dbDown,
    });
    await expect(startSession(ctx, { gameId: "game_1" })).rejects.toBe(dbDown);
  });

  it("throws CoreError if the insert unexpectedly returns nothing", async () => {
    const { ctx } = makeCtx({
      userId: "user_1",
      activeSession: undefined,
      insertReturning: [],
    });
    await expect(startSession(ctx, { gameId: "game_1" })).rejects.toThrowError(
      CoreError,
    );
  });
});
