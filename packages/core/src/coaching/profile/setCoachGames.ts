import { z } from "zod/v4";

import { and, eq, inArray, notInArray } from "@gamer-health/db";
import { CoachGame, Game } from "@gamer-health/db/schema";

import type { ServiceCtx, TxDb } from "../../ctx";
import type { CoachProfileDetail } from "./getOrCreateCoachProfile";
import { requireRole } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";
import { ensureCoachProfileRow } from "./getOrCreateCoachProfile";

export const setCoachGamesInput = z.object({
  gameIds: z.array(z.uuid()).max(20),
});
export type SetCoachGamesInput = z.infer<typeof setCoachGamesInput>;

/**
 * Replace-set: the caller's `coach_game` rows become exactly `gameIds`.
 * Every id must exist (`NOT_FOUND` otherwise, checked before any `coach_game`
 * write — `ensureCoachProfileRow` may create the profile row before that);
 * rows no longer in the set are deleted, new ones inserted with
 * `onConflictDoNothing`. All in one transaction.
 */
export async function setCoachGames(
  ctx: ServiceCtx,
  input: SetCoachGamesInput,
): Promise<CoachProfileDetail["games"]> {
  const authz = await requireRole(ctx, ["coach"]);
  await ensureCoachProfileRow(ctx, authz.userId);

  const gameIds = Array.from(new Set(input.gameIds));

  return ctx.db.transaction(async (tx: TxDb) => {
    if (gameIds.length > 0) {
      const existingGames = await tx.query.Game.findMany({
        where: inArray(Game.id, gameIds),
        columns: { id: true },
      });
      if (existingGames.length !== gameIds.length) {
        throw new CoreError("NOT_FOUND", "One or more games not found");
      }
    }

    if (gameIds.length > 0) {
      await tx
        .delete(CoachGame)
        .where(
          and(
            eq(CoachGame.coachUserId, authz.userId),
            notInArray(CoachGame.gameId, gameIds),
          ),
        );
      await tx
        .insert(CoachGame)
        .values(
          gameIds.map((gameId) => ({ coachUserId: authz.userId, gameId })),
        )
        .onConflictDoNothing();
    } else {
      await tx.delete(CoachGame).where(eq(CoachGame.coachUserId, authz.userId));
    }

    const rows = await tx.query.CoachGame.findMany({
      where: eq(CoachGame.coachUserId, authz.userId),
      with: { game: true },
    });
    return rows
      .map((row) => ({
        id: row.game.id,
        name: row.game.name,
        platform: row.game.platform,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}
