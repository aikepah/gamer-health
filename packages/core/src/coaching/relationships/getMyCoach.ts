import type { CoachSpecialty } from "@gamer-health/validators";
import { and, eq } from "@gamer-health/db";
import { CoachingRelationship, CoachProfile, user } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireActiveUser } from "../../authz/requireRole";

export interface MyCoachSummary {
  relationshipId: string;
  startedAt: Date | null;
  coach: {
    userId: string;
    name: string;
    headline: string | null;
    specialties: CoachSpecialty[];
  };
}

/**
 * The caller's "My coach" card (#11 dashboard): their active relationship
 * plus enough of the coach's profile to render it. Returns `null` (not an
 * error) when the player has no active coach — that's the normal "apply to a
 * coach" state, not a failure.
 */
export async function getMyCoach(
  ctx: ServiceCtx,
): Promise<MyCoachSummary | null> {
  const authz = await requireActiveUser(ctx);

  const row = await ctx.db
    .select({
      relationshipId: CoachingRelationship.id,
      startedAt: CoachingRelationship.startedAt,
      coachUserId: CoachingRelationship.coachUserId,
      coachName: user.name,
      coachHeadline: CoachProfile.headline,
      coachSpecialties: CoachProfile.specialties,
    })
    .from(CoachingRelationship)
    .innerJoin(user, eq(user.id, CoachingRelationship.coachUserId))
    .leftJoin(
      CoachProfile,
      eq(CoachProfile.userId, CoachingRelationship.coachUserId),
    )
    .where(
      and(
        eq(CoachingRelationship.playerUserId, authz.userId),
        eq(CoachingRelationship.status, "active"),
      ),
    )
    .limit(1);

  const found = row[0];
  if (!found) {
    return null;
  }

  return {
    relationshipId: found.relationshipId,
    startedAt: found.startedAt,
    coach: {
      userId: found.coachUserId,
      name: found.coachName,
      headline: found.coachHeadline ?? null,
      specialties: (found.coachSpecialties ?? []) as CoachSpecialty[],
    },
  };
}
