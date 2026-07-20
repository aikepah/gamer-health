import { z } from "zod/v4";

import { eq, sql } from "@gamer-health/db";
import { CoachGame, Game, GameSession } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";
import { recordAdminAudit } from "../audit";

export const mergeGamesInput = z.object({
  sourceGameId: z.uuid(),
  targetGameId: z.uuid(),
});
export type MergeGamesInput = z.infer<typeof mergeGamesInput>;

export interface MergeGamesResult {
  movedSessions: number;
}

/**
 * Merges `sourceGameId` into `targetGameId`: repoints every `game_session`
 * row from source to target, then deletes the source. `steamAppId` moves to
 * the target only when the target doesn't already have one; if both have one
 * and they differ, this throws CONFLICT before any write (Steam identity is
 * ambiguous — resolve manually).
 */
export async function mergeGames(
  ctx: ServiceCtx,
  input: MergeGamesInput,
): Promise<MergeGamesResult> {
  const actor = await requireRole(ctx, ["admin"]);

  if (input.sourceGameId === input.targetGameId) {
    throw new CoreError("BAD_REQUEST", "Cannot merge a game into itself");
  }

  const [source, target] = await Promise.all([
    ctx.db.query.Game.findFirst({ where: eq(Game.id, input.sourceGameId) }),
    ctx.db.query.Game.findFirst({ where: eq(Game.id, input.targetGameId) }),
  ]);
  if (!source) {
    throw new CoreError("NOT_FOUND", "Source game not found");
  }
  if (!target) {
    throw new CoreError("NOT_FOUND", "Target game not found");
  }

  let steamAppIdForTarget: number | null | undefined;
  if (source.steamAppId != null) {
    if (target.steamAppId != null) {
      if (target.steamAppId !== source.steamAppId) {
        throw new CoreError(
          "CONFLICT",
          "Both games have a different Steam app id — resolve manually before merging",
        );
      }
      // Same id on both; nothing to move.
    } else {
      steamAppIdForTarget = source.steamAppId;
    }
  }

  const movedSessions = await ctx.db.transaction(async (tx) => {
    const updated = await tx
      .update(GameSession)
      .set({ gameId: input.targetGameId })
      .where(eq(GameSession.gameId, input.sourceGameId))
      .returning({ id: GameSession.id });

    // Repoint coaches-coached rows. Insert-then-delete (not UPDATE): a coach
    // may already coach the target game, and the PK would reject the update.
    await tx.execute(sql`
      INSERT INTO coach_game (coach_user_id, game_id, created_at)
      SELECT coach_user_id, ${input.targetGameId}::uuid, created_at
      FROM coach_game WHERE game_id = ${input.sourceGameId}::uuid
      ON CONFLICT DO NOTHING
    `);
    await tx.delete(CoachGame).where(eq(CoachGame.gameId, input.sourceGameId));

    // Delete the source BEFORE moving steamAppId to the target: the column
    // has a unique constraint, so setting the target while the source row
    // still holds the same value would abort the transaction with 23505.
    await tx.delete(Game).where(eq(Game.id, input.sourceGameId));

    if (steamAppIdForTarget !== undefined) {
      await tx
        .update(Game)
        .set({ steamAppId: steamAppIdForTarget })
        .where(eq(Game.id, input.targetGameId));
    }

    await recordAdminAudit(tx, {
      actorUserId: actor.userId,
      action: "game_merge",
      meta: {
        sourceName: source.name,
        targetName: target.name,
        movedSessions: updated.length,
      },
    });

    return updated.length;
  });

  return { movedSessions };
}
