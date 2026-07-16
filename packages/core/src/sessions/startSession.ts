import { z } from "zod/v4";

import { and, eq, isNull } from "@gamer-health/db";
import { GameSession } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { requireUserId } from "../lib/auth";
import { CoreError, isUniqueViolation } from "../lib/errors";

export type GameSessionRow = typeof GameSession.$inferSelect;

export const startSessionInput = z.object({
  gameId: z.uuid(),
  notes: z.string().max(2000).optional(),
});
export type StartSessionInput = z.infer<typeof startSessionInput>;

/**
 * Starts a live session for the caller. Fails with `CoreError("CONFLICT")`
 * if the caller already has an active (unended) session.
 */
export async function startSession(
  ctx: ServiceCtx,
  input: StartSessionInput,
): Promise<GameSessionRow> {
  const userId = requireUserId(ctx);

  const active = await ctx.db.query.GameSession.findFirst({
    where: and(eq(GameSession.userId, userId), isNull(GameSession.endedAt)),
  });
  if (active) {
    throw new CoreError("CONFLICT", "A session is already active");
  }

  let session: GameSessionRow | undefined;
  try {
    [session] = await ctx.db
      .insert(GameSession)
      .values({
        userId,
        gameId: input.gameId,
        startedAt: new Date(),
        endedAt: null,
        source: "manual",
        notes: input.notes,
      })
      .returning();
  } catch (err) {
    // Concurrent double-submit: both requests pass the check above and the
    // loser trips the one-active-session partial unique index (23505).
    if (isUniqueViolation(err)) {
      throw new CoreError("CONFLICT", "A session is already active");
    }
    throw err;
  }
  if (!session) {
    throw new CoreError("CONFLICT", "Failed to start session");
  }
  return session;
}
