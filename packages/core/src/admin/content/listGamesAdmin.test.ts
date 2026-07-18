import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { listGamesAdmin } from "./listGamesAdmin";

interface ProfileSnapshot {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

function makeCountChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

function makeGroupByChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue(result),
  };
}

function makeCtx(config: {
  actorProfile?: ProfileSnapshot;
  games?: { id: string; name: string }[];
  total?: number;
  sessionAgg?: { gameId: string; value: number }[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(config.actorProfile);
  const gameFindMany = vi.fn().mockResolvedValue(config.games ?? []);

  const select = vi
    .fn()
    .mockReturnValueOnce(makeCountChain([{ value: config.total ?? 0 }]))
    .mockReturnValueOnce(makeGroupByChain(config.sessionAgg ?? []));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      Game: { findMany: gameFindMany },
    },
    select,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "admin_1" } as ServiceCtx, select };
}

describe("listGamesAdmin", () => {
  it("throws CoreError(FORBIDDEN) for a non-admin", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "player", deactivatedAt: null },
    });
    await expect(
      listGamesAdmin(ctx, { limit: 50, offset: 0 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns games with a zero session count when there is no aggregate row", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      games: [
        {
          id: "game_1",
          name: "Elden Ring",
          platform: "PC",
          steamAppId: null,
          createdAt: new Date(),
        } as unknown as { id: string; name: string },
      ],
      total: 1,
      sessionAgg: [],
    });

    const result = await listGamesAdmin(ctx, { limit: 50, offset: 0 });

    expect(result.total).toBe(1);
    expect(result.games).toEqual([
      expect.objectContaining({ id: "game_1", sessionCount: 0 }),
    ]);
  });

  it("attaches the session count aggregate per game", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      games: [
        {
          id: "game_1",
          name: "Rocket League",
          platform: "PC",
          steamAppId: null,
          createdAt: new Date(),
        } as unknown as { id: string; name: string },
      ],
      total: 1,
      sessionAgg: [{ gameId: "game_1", value: 3 }],
    });

    const result = await listGamesAdmin(ctx, { limit: 50, offset: 0 });

    expect(result.games[0]?.sessionCount).toBe(3);
  });

  it("returns an empty result without querying session aggregates when there are no games", async () => {
    const { ctx, select } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      games: [],
      total: 0,
    });

    const result = await listGamesAdmin(ctx, { limit: 50, offset: 0 });

    expect(result).toEqual({ total: 0, games: [] });
    // Only the total-count select, not the session aggregate select.
    expect(select).toHaveBeenCalledTimes(1);
  });
});
