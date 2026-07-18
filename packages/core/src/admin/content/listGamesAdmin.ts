import { z } from "zod/v4";

import { count, ilike, inArray } from "@gamer-health/db";
import { Game, GameSession } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";

export const listGamesAdminInput = z.object({
  query: z.string().trim().max(255).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
export type ListGamesAdminInput = z.infer<typeof listGamesAdminInput>;

export interface ListGamesAdminRow {
  id: string;
  name: string;
  platform: string | null;
  steamAppId: number | null;
  createdAt: Date;
  sessionCount: number;
}

export interface ListGamesAdminResult {
  total: number;
  games: ListGamesAdminRow[];
}

/**
 * Admin games catalog listing for `/admin/content` (games tab): searchable,
 * paginated, with a session-count aggregate per game so the UI can disable
 * delete and surface merge as the suggested action.
 */
export async function listGamesAdmin(
  ctx: ServiceCtx,
  input: ListGamesAdminInput,
): Promise<ListGamesAdminResult> {
  await requireRole(ctx, ["admin"]);

  const where = input.query ? ilike(Game.name, `%${input.query}%`) : undefined;

  const [rows, totalRows] = await Promise.all([
    ctx.db.query.Game.findMany({
      where,
      orderBy: (game, { asc }) => [asc(game.name)],
      limit: input.limit,
      offset: input.offset,
    }),
    ctx.db.select({ value: count() }).from(Game).where(where),
  ]);

  const total = totalRows[0]?.value ?? 0;
  const gameIds = rows.map((r) => r.id);
  if (gameIds.length === 0) {
    return { total, games: [] };
  }

  const sessionAgg = await ctx.db
    .select({ gameId: GameSession.gameId, value: count() })
    .from(GameSession)
    .where(inArray(GameSession.gameId, gameIds))
    .groupBy(GameSession.gameId);
  const sessionCountByGame = new Map(
    sessionAgg.map((r) => [r.gameId, r.value]),
  );

  return {
    total,
    games: rows.map((r) => ({
      id: r.id,
      name: r.name,
      platform: r.platform,
      steamAppId: r.steamAppId,
      createdAt: r.createdAt,
      sessionCount: sessionCountByGame.get(r.id) ?? 0,
    })),
  };
}
