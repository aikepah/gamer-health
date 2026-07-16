import { z } from "zod/v4";

import { and, eq } from "@gamer-health/db";
import { GameSession } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { requireUserId } from "../lib/auth";
import { CoreError } from "../lib/errors";

export const deleteSessionInput = z.object({ id: z.uuid() });
export type DeleteSessionInput = z.infer<typeof deleteSessionInput>;

/** Deletes a session belonging to the caller. Does not revoke XP. */
export async function deleteSession(
  ctx: ServiceCtx,
  input: DeleteSessionInput,
): Promise<{ deleted: true }> {
  const userId = requireUserId(ctx);

  const [deleted] = await ctx.db
    .delete(GameSession)
    .where(and(eq(GameSession.id, input.id), eq(GameSession.userId, userId)))
    .returning({ id: GameSession.id });
  if (!deleted) {
    throw new CoreError("NOT_FOUND", "Session not found");
  }
  return { deleted: true };
}
