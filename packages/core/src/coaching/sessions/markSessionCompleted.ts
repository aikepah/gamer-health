import { z } from "zod/v4";

import { and, eq } from "@gamer-health/db";
import { CoachingSession } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";

export const markSessionCompletedInput = z.object({ sessionId: z.uuid() });
export type MarkSessionCompletedInput = z.infer<
  typeof markSessionCompletedInput
>;

/**
 * Coach-only, explicit: marks a `confirmed` session `completed` once
 * `startsAt` is in the past (CONFLICT "That session hasn't happened yet"
 * otherwise). The UI additionally groups past `confirmed` sessions under
 * "Past" without mutating them — this is the only thing that flips the
 * status (see docs/features/coaching-sessions.md).
 */
export async function markSessionCompleted(
  ctx: ServiceCtx,
  input: MarkSessionCompletedInput,
): Promise<void> {
  const authz = await requireRole(ctx, ["coach"]);

  const row = await ctx.db.query.CoachingSession.findFirst({
    where: eq(CoachingSession.id, input.sessionId),
  });
  if (!row || row.coachUserId !== authz.userId) {
    throw new CoreError("NOT_FOUND", "Session not found");
  }
  if (row.status !== "confirmed") {
    throw new CoreError(
      "CONFLICT",
      "Only a confirmed session can be marked completed",
    );
  }
  if (row.startsAt.getTime() > Date.now()) {
    throw new CoreError("CONFLICT", "That session hasn't happened yet");
  }

  // Conditional on id + still confirmed: the read above isn't atomic with
  // this write, and a concurrent cancel could race it. Zero updated rows
  // means we lost that race.
  const updated = await ctx.db
    .update(CoachingSession)
    .set({ status: "completed", completedAt: new Date() })
    .where(
      and(
        eq(CoachingSession.id, input.sessionId),
        eq(CoachingSession.status, "confirmed"),
      ),
    )
    .returning({ id: CoachingSession.id });
  if (updated.length === 0) {
    throw new CoreError(
      "CONFLICT",
      "Only a confirmed session can be marked completed",
    );
  }
}
