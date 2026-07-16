import { z } from "zod/v4";

import { and, eq, isNull } from "@gamer-health/db";
import { GameSession } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import type { GameSessionRow } from "./startSession";
import { recordRewardEvent } from "../gamification/events";
import { requireUserId } from "../lib/auth";
import { CoreError } from "../lib/errors";

export const stopSessionInput = z.object({});
export type StopSessionInput = z.infer<typeof stopSessionInput>;

/**
 * Stops the caller's active session (sets `endedAt`) and emits
 * `session_logged`. `CoreError("NOT_FOUND")` if no session is active.
 */
export async function stopSession(
  ctx: ServiceCtx,
  _input: StopSessionInput,
): Promise<GameSessionRow> {
  const userId = requireUserId(ctx);

  const active = await ctx.db.query.GameSession.findFirst({
    where: and(eq(GameSession.userId, userId), isNull(GameSession.endedAt)),
  });
  if (!active) {
    throw new CoreError("NOT_FOUND", "No active session");
  }

  // Guarantee endedAt > startedAt even for a same-millisecond stop (the
  // check constraint is strict; programmatic start-then-stop can hit this).
  const endedAt = new Date(
    Math.max(Date.now(), active.startedAt.getTime() + 1),
  );
  const [session] = await ctx.db
    .update(GameSession)
    .set({ endedAt })
    .where(eq(GameSession.id, active.id))
    .returning();
  if (!session) {
    throw new CoreError("NOT_FOUND", "No active session");
  }

  await recordRewardEvent(ctx, {
    eventType: "session_logged",
    sourceId: session.id,
  });

  return session;
}
