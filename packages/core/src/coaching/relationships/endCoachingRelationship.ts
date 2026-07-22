import { z } from "zod/v4";

import { and, eq, gt, inArray } from "@gamer-health/db";
import {
  CoachingRelationship,
  CoachingSession,
} from "@gamer-health/db/schema";

import type { ServiceCtx, TxDb } from "../../ctx";
import { requireActiveUser } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";

export const endCoachingRelationshipInput = z.object({
  relationshipId: z.uuid(),
  reason: z.string().trim().max(500).optional(),
});
export type EndCoachingRelationshipInput = z.infer<
  typeof endCoachingRelationshipInput
>;

/**
 * Ends an active relationship (#11). Either party may do this — the player
 * OR the coach — so this uses `requireActiveUser`, not a coach-only guard.
 * `NOT_FOUND` if the row doesn't exist or the caller is neither its player
 * nor its coach (never distinguishes the two). `CONFLICT` if it isn't
 * currently `active`.
 *
 * Rows are never deleted or reassigned: goals (#13) and coach-assigned
 * habits (#14) survive with their provenance intact; only future
 * `proposed`/`confirmed` coaching sessions (#15) are cancelled in the same
 * transaction, since a session with no relationship is meaningless.
 */
export async function endCoachingRelationship(
  ctx: ServiceCtx,
  input: EndCoachingRelationshipInput,
): Promise<void> {
  const authz = await requireActiveUser(ctx);

  const row = await ctx.db.query.CoachingRelationship.findFirst({
    where: eq(CoachingRelationship.id, input.relationshipId),
  });
  if (
    !row ||
    (row.playerUserId !== authz.userId && row.coachUserId !== authz.userId)
  ) {
    throw new CoreError("NOT_FOUND", "Coaching relationship not found");
  }
  if (row.status !== "active") {
    throw new CoreError(
      "CONFLICT",
      "This coaching relationship is no longer active",
    );
  }

  await ctx.db.transaction(async (tx: TxDb) => {
    // Conditional on id + still `active`: the read above isn't atomic with
    // this write, and a concurrent end (from the other party) could race it.
    // Zero updated rows means we lost that race.
    const [ended] = await tx
      .update(CoachingRelationship)
      .set({
        status: "ended",
        endedAt: new Date(),
        endedByUserId: authz.userId,
        endReason: input.reason ?? null,
      })
      .where(
        and(
          eq(CoachingRelationship.id, input.relationshipId),
          eq(CoachingRelationship.status, "active"),
        ),
      )
      .returning({ id: CoachingRelationship.id });
    if (!ended) {
      throw new CoreError(
        "CONFLICT",
        "This coaching relationship is no longer active",
      );
    }

    // #15: a session with no relationship is meaningless, so cancel this
    // relationship's future proposed/confirmed sessions in the same
    // transaction. Past sessions (including a past-but-unconfirmed slot)
    // are left alone — there's nothing to "cancel" about something already
    // over, and completed sessions are untouched history.
    await tx
      .update(CoachingSession)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledByUserId: authz.userId,
        cancelReason: "Coaching relationship ended",
      })
      .where(
        and(
          eq(CoachingSession.relationshipId, input.relationshipId),
          inArray(CoachingSession.status, ["proposed", "confirmed"]),
          gt(CoachingSession.startsAt, new Date()),
        ),
      );
  });
}
