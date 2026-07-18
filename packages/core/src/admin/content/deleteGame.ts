import { z } from "zod/v4";

import { count, eq } from "@gamer-health/db";
import { Game, GameSession } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";
import { recordAdminAudit } from "../audit";

export const deleteGameInput = z.object({ gameId: z.uuid() });
export type DeleteGameInput = z.infer<typeof deleteGameInput>;

/**
 * Deletes a catalog game. Only allowed when zero `game_session` rows
 * reference it — the FK would block it at the DB level regardless, but we
 * check first so the error is a friendly CONFLICT suggesting merge.
 */
export async function deleteGame(
  ctx: ServiceCtx,
  input: DeleteGameInput,
): Promise<void> {
  const actor = await requireRole(ctx, ["admin"]);

  const existing = await ctx.db.query.Game.findFirst({
    where: eq(Game.id, input.gameId),
  });
  if (!existing) {
    throw new CoreError("NOT_FOUND", "Game not found");
  }

  const [sessionCountRow] = await ctx.db
    .select({ value: count() })
    .from(GameSession)
    .where(eq(GameSession.gameId, input.gameId));
  if ((sessionCountRow?.value ?? 0) > 0) {
    throw new CoreError(
      "CONFLICT",
      "This game has logged sessions — merge it into another game instead",
    );
  }

  await ctx.db.transaction(async (tx) => {
    await tx.delete(Game).where(eq(Game.id, input.gameId));
    await recordAdminAudit(tx, {
      actorUserId: actor.userId,
      action: "game_delete",
      meta: { name: existing.name },
    });
  });
}
