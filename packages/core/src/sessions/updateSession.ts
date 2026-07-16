import { z } from "zod/v4";

import { and, eq } from "@gamer-health/db";
import { GameSession } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import type { GameSessionRow } from "./startSession";
import { requireUserId } from "../lib/auth";
import { CoreError } from "../lib/errors";
import { assertValidSessionTimes } from "./time";

export const updateSessionInput = z.object({
  id: z.uuid(),
  gameId: z.uuid().optional(),
  startedAt: z.date().optional(),
  endedAt: z.date().optional(),
  notes: z.string().max(2000).nullish(),
});
export type UpdateSessionInput = z.infer<typeof updateSessionInput>;

/**
 * Edits a completed session belonging to the caller. `CoreError("NOT_FOUND")`
 * if the session doesn't exist (or belongs to someone else); `CoreError`
 * `("BAD_REQUEST")` if it's still active or the resulting times are invalid.
 */
export async function updateSession(
  ctx: ServiceCtx,
  input: UpdateSessionInput,
): Promise<GameSessionRow> {
  const userId = requireUserId(ctx);

  const existing = await ctx.db.query.GameSession.findFirst({
    where: and(eq(GameSession.id, input.id), eq(GameSession.userId, userId)),
  });
  if (!existing) {
    throw new CoreError("NOT_FOUND", "Session not found");
  }
  if (existing.endedAt === null) {
    throw new CoreError("BAD_REQUEST", "Cannot edit an active session");
  }

  const startedAt = input.startedAt ?? existing.startedAt;
  const endedAt = input.endedAt ?? existing.endedAt;
  assertValidSessionTimes(startedAt, endedAt);

  const [session] = await ctx.db
    .update(GameSession)
    .set({
      gameId: input.gameId ?? existing.gameId,
      startedAt,
      endedAt,
      notes: input.notes !== undefined ? input.notes : existing.notes,
    })
    .where(eq(GameSession.id, input.id))
    .returning();
  if (!session) {
    throw new CoreError("NOT_FOUND", "Session not found");
  }
  return session;
}
