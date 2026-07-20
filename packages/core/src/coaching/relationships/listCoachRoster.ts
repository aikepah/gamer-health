import { z } from "zod/v4";

import type { CoachingRelationshipStatus } from "@gamer-health/validators";
import { and, asc, desc, eq } from "@gamer-health/db";
import { CoachingRelationship, user } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";

export const listCoachRosterInput = z.object({
  status: z.enum(["active", "applied"]).default("active"),
});
export type ListCoachRosterInput = z.infer<typeof listCoachRosterInput>;

export interface RosterEntry {
  relationshipId: string;
  status: CoachingRelationshipStatus;
  player: { userId: string; name: string; email: string };
  message: string | null;
  appliedAt: Date;
  startedAt: Date | null;
}

/**
 * The coach's own roster (#11): `active` players or pending `applied`
 * applicants, depending on `input.status`. `active` rows are ordered
 * newest-coaching-relationship-first (`startedAt desc`); `applied` rows are
 * ordered oldest-application-first (`appliedAt asc`) — fairness, so the
 * longest-waiting applicant is always at the top of the inbox.
 */
export async function listCoachRoster(
  ctx: ServiceCtx,
  input: ListCoachRosterInput,
): Promise<RosterEntry[]> {
  const authz = await requireRole(ctx, ["coach"]);

  const rows = await ctx.db
    .select({
      relationshipId: CoachingRelationship.id,
      status: CoachingRelationship.status,
      playerUserId: CoachingRelationship.playerUserId,
      playerName: user.name,
      playerEmail: user.email,
      message: CoachingRelationship.message,
      appliedAt: CoachingRelationship.appliedAt,
      startedAt: CoachingRelationship.startedAt,
    })
    .from(CoachingRelationship)
    .innerJoin(user, eq(user.id, CoachingRelationship.playerUserId))
    .where(
      and(
        eq(CoachingRelationship.coachUserId, authz.userId),
        eq(CoachingRelationship.status, input.status),
      ),
    )
    .orderBy(
      input.status === "active"
        ? desc(CoachingRelationship.startedAt)
        : asc(CoachingRelationship.appliedAt),
    );

  return rows.map((row) => ({
    relationshipId: row.relationshipId,
    status: row.status,
    player: {
      userId: row.playerUserId,
      name: row.playerName,
      email: row.playerEmail,
    },
    message: row.message,
    appliedAt: row.appliedAt,
    startedAt: row.startedAt,
  }));
}
