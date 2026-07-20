import { z } from "zod/v4";

import { and, eq, inArray } from "@gamer-health/db";
import {
  CoachingRelationship,
  CoachProfile,
  Profile,
} from "@gamer-health/db/schema";
import { OPEN_COACHING_RELATIONSHIP_STATUSES } from "@gamer-health/validators";

import type { ServiceCtx } from "../../ctx";
import { requireActiveUser } from "../../authz/requireRole";
import { CoreError, isUniqueViolation } from "../../lib/errors";
import { isCoachDiscoverable } from "./publishedCoachWhere";

export const applyToCoachInput = z.object({
  coachUserId: z.string().min(1),
  message: z.string().trim().max(1000).optional(),
});
export type ApplyToCoachInput = z.infer<typeof applyToCoachInput>;

export interface ApplyToCoachResult {
  relationshipId: string;
}

/**
 * Creates an `applied` `coaching_relationship` row (#10). Any active user may
 * apply, except to themselves. Guards run in a fixed order (see
 * docs/features/coach-discovery.md) so the error the caller sees always
 * reflects the FIRST thing wrong, not whichever the DB happens to check:
 *   1. Applying to yourself                        -> BAD_REQUEST
 *   2. Coach not discoverable (unpublished/gone)    -> NOT_FOUND
 *   3. Coach not accepting new players              -> CONFLICT
 *   4. Caller already has an active coach           -> CONFLICT
 *   5. Caller already has an open row w/ this coach -> CONFLICT
 * The insert is additionally guarded against the `coaching_relationship_
 * open_pair_idx` partial unique index racing a concurrent application.
 */
export async function applyToCoach(
  ctx: ServiceCtx,
  input: ApplyToCoachInput,
): Promise<ApplyToCoachResult> {
  const authz = await requireActiveUser(ctx);

  if (input.coachUserId === authz.userId) {
    throw new CoreError("BAD_REQUEST", "You can't coach yourself");
  }

  const [profileRow, coachProfileRow] = await Promise.all([
    ctx.db.query.Profile.findFirst({
      where: eq(Profile.userId, input.coachUserId),
      columns: { role: true, deactivatedAt: true },
    }),
    ctx.db.query.CoachProfile.findFirst({
      where: eq(CoachProfile.userId, input.coachUserId),
      columns: { isPublished: true, acceptingApplications: true },
    }),
  ]);

  if (
    !coachProfileRow ||
    !isCoachDiscoverable({
      isPublished: coachProfileRow.isPublished,
      role: profileRow?.role,
      deactivatedAt: profileRow?.deactivatedAt,
    })
  ) {
    throw new CoreError("NOT_FOUND", "Coach not found");
  }

  if (!coachProfileRow.acceptingApplications) {
    throw new CoreError("CONFLICT", "This coach isn't accepting new players");
  }

  const existingActive = await ctx.db.query.CoachingRelationship.findFirst({
    where: and(
      eq(CoachingRelationship.playerUserId, authz.userId),
      eq(CoachingRelationship.status, "active"),
    ),
  });
  if (existingActive) {
    throw new CoreError(
      "CONFLICT",
      "You already have a coach — end that relationship first",
    );
  }

  const existingOpenWithCoach =
    await ctx.db.query.CoachingRelationship.findFirst({
      where: and(
        eq(CoachingRelationship.playerUserId, authz.userId),
        eq(CoachingRelationship.coachUserId, input.coachUserId),
        inArray(
          CoachingRelationship.status,
          OPEN_COACHING_RELATIONSHIP_STATUSES,
        ),
      ),
    });
  if (existingOpenWithCoach) {
    throw new CoreError("CONFLICT", "You've already applied to this coach");
  }

  try {
    const [inserted] = await ctx.db
      .insert(CoachingRelationship)
      .values({
        playerUserId: authz.userId,
        coachUserId: input.coachUserId,
        status: "applied",
        initiatedByUserId: authz.userId,
        message: input.message,
        appliedAt: new Date(),
      })
      .returning({ id: CoachingRelationship.id });

    if (!inserted) {
      throw new CoreError("CONFLICT", "You've already applied to this coach");
    }
    return { relationshipId: inserted.id };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new CoreError("CONFLICT", "You've already applied to this coach");
    }
    throw err;
  }
}
