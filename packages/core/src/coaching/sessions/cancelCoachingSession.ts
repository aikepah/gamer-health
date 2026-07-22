import { z } from "zod/v4";

import { and, eq, inArray } from "@gamer-health/db";
import { CoachingSession } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireActiveUser } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";

export const cancelCoachingSessionInput = z.object({
  sessionId: z.uuid(),
  reason: z.string().trim().max(500).optional(),
});
export type CancelCoachingSessionInput = z.infer<
  typeof cancelCoachingSessionInput
>;

/**
 * Cancels a `proposed` or `confirmed` session (#15). Either side may do
 * this — the caller must be the row's player OR coach (else NOT_FOUND,
 * never distinguishing the two). A coach cancelling a `proposed` row IS the
 * decline action; there's no separate "declined" status (see
 * docs/features/coaching-sessions.md).
 */
export async function cancelCoachingSession(
  ctx: ServiceCtx,
  input: CancelCoachingSessionInput,
): Promise<void> {
  const authz = await requireActiveUser(ctx);

  const row = await ctx.db.query.CoachingSession.findFirst({
    where: eq(CoachingSession.id, input.sessionId),
  });
  if (
    !row ||
    (row.playerUserId !== authz.userId && row.coachUserId !== authz.userId)
  ) {
    throw new CoreError("NOT_FOUND", "Session not found");
  }
  if (row.status !== "proposed" && row.status !== "confirmed") {
    throw new CoreError(
      "CONFLICT",
      "This session can no longer be cancelled",
    );
  }

  // Conditional on id + still proposed/confirmed: the read above isn't
  // atomic with this write, and the other party (or a coach auto-cancel)
  // could race it. Zero updated rows means we lost that race.
  const updated = await ctx.db
    .update(CoachingSession)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledByUserId: authz.userId,
      cancelReason: input.reason ?? null,
    })
    .where(
      and(
        eq(CoachingSession.id, input.sessionId),
        inArray(CoachingSession.status, ["proposed", "confirmed"]),
      ),
    )
    .returning({ id: CoachingSession.id });
  if (updated.length === 0) {
    throw new CoreError(
      "CONFLICT",
      "This session can no longer be cancelled",
    );
  }
}
