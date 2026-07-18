import { z } from "zod/v4";

import { eq } from "@gamer-health/db";
import { Game } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import type { GameRow } from "../../sessions/games";
import { requireRole } from "../../authz/requireRole";
import { CoreError, isUniqueViolation } from "../../lib/errors";
import { recordAdminAudit } from "../audit";

export const renameGameInput = z.object({
  gameId: z.uuid(),
  name: z.string().trim().min(1).max(256),
  platform: z.string().trim().min(1).max(64).nullish(),
});
export type RenameGameInput = z.infer<typeof renameGameInput>;

/**
 * Renames/re-platforms a catalog game. `game_name_lower_idx` enforces
 * case-insensitive uniqueness at the DB level; a violation is surfaced as a
 * friendly CONFLICT pointing at merge instead of a raw constraint error.
 */
export async function renameGame(
  ctx: ServiceCtx,
  input: RenameGameInput,
): Promise<GameRow> {
  const actor = await requireRole(ctx, ["admin"]);

  const existing = await ctx.db.query.Game.findFirst({
    where: eq(Game.id, input.gameId),
  });
  if (!existing) {
    throw new CoreError("NOT_FOUND", "Game not found");
  }

  let updated: GameRow;
  try {
    const [row] = await ctx.db
      .update(Game)
      .set({ name: input.name, platform: input.platform ?? null })
      .where(eq(Game.id, input.gameId))
      .returning();
    if (!row) {
      throw new CoreError("NOT_FOUND", "Game not found");
    }
    updated = row;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new CoreError(
        "CONFLICT",
        "A game with this name already exists — merge instead",
      );
    }
    throw err;
  }

  await recordAdminAudit(ctx.db, {
    actorUserId: actor.userId,
    action: "game_rename",
    meta: { from: existing.name, to: updated.name },
  });

  return updated;
}
