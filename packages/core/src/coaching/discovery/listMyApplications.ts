import type { CoachingRelationshipStatus } from "@gamer-health/validators";
import { and, desc, eq, ne } from "@gamer-health/db";
import {
  CoachingRelationship,
  CoachProfile,
  user,
} from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireActiveUser } from "../../authz/requireRole";

export interface MyApplicationRow {
  relationshipId: string;
  status: CoachingRelationshipStatus;
  appliedAt: Date;
  respondedAt: Date | null;
  responseNote: string | null;
  coach: { userId: string; name: string; headline: string | null };
}

/**
 * The caller's own coaching-relationship rows as *player*, newest first,
 * excluding `active` (that one is #11's "my coach" card, not a discovery
 * concern). Powers the "Your applications" panel on `/coaches` and the
 * apply-panel state on a coach's detail page.
 */
export async function listMyApplications(
  ctx: ServiceCtx,
): Promise<MyApplicationRow[]> {
  const authz = await requireActiveUser(ctx);

  const rows = await ctx.db
    .select({
      relationshipId: CoachingRelationship.id,
      status: CoachingRelationship.status,
      appliedAt: CoachingRelationship.appliedAt,
      respondedAt: CoachingRelationship.respondedAt,
      responseNote: CoachingRelationship.responseNote,
      coachUserId: CoachingRelationship.coachUserId,
      coachName: user.name,
      coachHeadline: CoachProfile.headline,
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
        ne(CoachingRelationship.status, "active"),
      ),
    )
    .orderBy(desc(CoachingRelationship.appliedAt));

  return rows.map((row) => ({
    relationshipId: row.relationshipId,
    status: row.status,
    appliedAt: row.appliedAt,
    respondedAt: row.respondedAt,
    responseNote: row.responseNote,
    coach: {
      userId: row.coachUserId,
      name: row.coachName,
      headline: row.coachHeadline ?? null,
    },
  }));
}
