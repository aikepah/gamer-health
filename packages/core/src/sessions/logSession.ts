import type { z } from "zod/v4";

import { GameSession, LogGameSessionSchema } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import type { GameSessionRow } from "./startSession";
import { recordRewardEvent } from "../gamification/events";
import { requireUserId } from "../lib/auth";
import { CoreError } from "../lib/errors";
import { assertValidSessionTimes } from "./time";

export const logSessionInput = LogGameSessionSchema;
export type LogSessionInput = z.infer<typeof logSessionInput>;

/**
 * Logs a completed session retroactively. Requires `startedAt < endedAt` and
 * `endedAt <= now` (`CoreError("BAD_REQUEST")` otherwise), then emits
 * `session_logged`.
 */
export async function logSession(
  ctx: ServiceCtx,
  input: LogSessionInput,
): Promise<GameSessionRow> {
  const userId = requireUserId(ctx);

  // `endedAt` is `.required()` on the schema but the underlying column is
  // nullable, so the inferred type keeps `| null` — a retroactive log always
  // supplies a real end time.
  if (input.endedAt === null) {
    throw new CoreError("BAD_REQUEST", "Session end time is required");
  }
  assertValidSessionTimes(input.startedAt, input.endedAt);

  const [session] = await ctx.db
    .insert(GameSession)
    .values({
      userId,
      gameId: input.gameId,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      notes: input.notes,
    })
    .returning();
  if (!session) {
    throw new CoreError("BAD_REQUEST", "Failed to log session");
  }

  await recordRewardEvent(ctx, {
    eventType: "session_logged",
    sourceId: session.id,
  });

  return session;
}
