import { z } from "zod/v4";

import { asc, ilike, sql } from "@gamer-health/db";
import { Game } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { requireUserId } from "../lib/auth";
import { CoreError } from "../lib/errors";

export type GameRow = typeof Game.$inferSelect;

export const searchGamesInput = z.object({
  query: z.string().trim().max(256).default(""),
  limit: z.number().int().min(1).max(25).default(10),
});
export type SearchGamesInput = z.infer<typeof searchGamesInput>;

/** Case-insensitive substring search over the catalog, ordered by name. */
export async function searchGames(
  ctx: ServiceCtx,
  input: SearchGamesInput,
): Promise<GameRow[]> {
  requireUserId(ctx);

  return ctx.db.query.Game.findMany({
    where: input.query ? ilike(Game.name, `%${input.query}%`) : undefined,
    orderBy: asc(Game.name),
    limit: input.limit,
  });
}

export const getOrCreateGameInput = z.object({
  name: z.string().trim().min(1).max(256),
  platform: z.string().trim().min(1).max(64).optional(),
});
export type GetOrCreateGameInput = z.infer<typeof getOrCreateGameInput>;

/**
 * Finds a catalog game by case-insensitive name match, creating one if none
 * exists. Races on creation are resolved via `onConflictDoNothing` + a
 * re-select against the `lower(name)` unique index.
 */
export async function getOrCreateGame(
  ctx: ServiceCtx,
  input: GetOrCreateGameInput,
): Promise<GameRow> {
  requireUserId(ctx);

  const findByName = () =>
    ctx.db.query.Game.findFirst({
      where: sql`lower(${Game.name}) = lower(${input.name})`,
    });

  const existing = await findByName();
  if (existing) {
    return existing;
  }

  const [inserted] = await ctx.db
    .insert(Game)
    .values({ name: input.name, platform: input.platform })
    .onConflictDoNothing()
    .returning();
  if (inserted) {
    return inserted;
  }

  const created = await findByName();
  if (!created) {
    throw new CoreError("NOT_FOUND", "Failed to create game");
  }
  return created;
}
