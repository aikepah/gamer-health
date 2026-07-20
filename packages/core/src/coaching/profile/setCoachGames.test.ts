import { describe, expect, it, vi } from "vitest";

import { Game } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import type { CoachProfileRow } from "./getOrCreateCoachProfile";
import { setCoachGames } from "./setCoachGames";

interface AuthzProfile {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

function makeCoachProfileRow(): CoachProfileRow {
  return {
    userId: "coach_1",
    headline: "Sleep coach",
    bio: null,
    specialties: [],
    isPublished: false,
    acceptingApplications: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeCtx(config: {
  authzProfile?: AuthzProfile;
  existingGameIds?: string[];
  finalGames?: {
    game: { id: string; name: string; platform: string | null };
  }[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(config.authzProfile);
  const coachProfileFindFirst = vi
    .fn()
    .mockResolvedValue(makeCoachProfileRow());

  const gameFindMany = vi
    .fn()
    .mockResolvedValue((config.existingGameIds ?? []).map((id) => ({ id })));
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const insertOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const insertValues = vi
    .fn()
    .mockReturnValue({ onConflictDoNothing: insertOnConflictDoNothing });
  const coachGameFindManyFinal = vi
    .fn()
    .mockResolvedValue(config.finalGames ?? []);

  const tx = {
    query: {
      Game: { findMany: gameFindMany },
      CoachGame: { findMany: coachGameFindManyFinal },
    },
    delete: vi.fn(() => ({ where: deleteWhere })),
    insert: vi.fn((table: unknown) => {
      if (table === Game) {
        throw new Error("unexpected Game insert in test");
      }
      return { values: insertValues };
    }),
  };

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachProfile: { findFirst: coachProfileFindFirst },
    },
    transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: "coach_1" } as ServiceCtx,
    deleteWhere,
    insertValues,
    insertOnConflictDoNothing,
  };
}

describe("setCoachGames", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach", async () => {
    const { ctx } = makeCtx({
      authzProfile: { role: "player", deactivatedAt: null },
    });
    await expect(setCoachGames(ctx, { gameIds: [] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws CoreError(NOT_FOUND) when a game id doesn't exist", async () => {
    const { ctx, insertValues } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      existingGameIds: ["g1"], // only one of two ids resolves
    });
    await expect(
      setCoachGames(ctx, { gameIds: ["g1", "g2"] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("replaces the set and returns games sorted by name", async () => {
    const { ctx, deleteWhere, insertValues } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      existingGameIds: ["g1", "g2"],
      finalGames: [
        { game: { id: "g2", name: "Zelda", platform: "Switch" } },
        { game: { id: "g1", name: "Elden Ring", platform: "PC" } },
      ],
    });

    const result = await setCoachGames(ctx, { gameIds: ["g1", "g2"] });

    expect(deleteWhere).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith([
      { coachUserId: "coach_1", gameId: "g1" },
      { coachUserId: "coach_1", gameId: "g2" },
    ]);
    expect(result.map((g) => g.name)).toEqual(["Elden Ring", "Zelda"]);
  });

  it("deletes all games when gameIds is empty, without inserting", async () => {
    const { ctx, deleteWhere, insertValues } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      existingGameIds: [],
      finalGames: [],
    });

    const result = await setCoachGames(ctx, { gameIds: [] });

    expect(deleteWhere).toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("de-duplicates repeated ids before validating/writing", async () => {
    const { ctx, insertValues } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      existingGameIds: ["g1"],
      finalGames: [{ game: { id: "g1", name: "Elden Ring", platform: "PC" } }],
    });

    await setCoachGames(ctx, { gameIds: ["g1", "g1"] });

    expect(insertValues).toHaveBeenCalledWith([
      { coachUserId: "coach_1", gameId: "g1" },
    ]);
  });
});
