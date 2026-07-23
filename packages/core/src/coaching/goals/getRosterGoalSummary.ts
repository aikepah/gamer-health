import { and, eq, sql } from "@gamer-health/db";
import { CoachingRelationship, Goal } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { localDateString } from "../../lib/dates";
import { getOrCreateProfile } from "../../profile/getOrCreateProfile";

export interface RosterGoalSummaryRow {
  playerUserId: string;
  open: number;
  overdue: number;
  completed: number;
}

/**
 * Per-player goal counts across the WHOLE roster in one grouped query (not
 * a per-player loop) — feeds the `/coach/roster` summary chip (#13
 * acceptance criterion 4). Joined on `coaching_relationship.player_user_id
 * = goal.player_user_id` (identity), not `goal.relationship_id` — a goal
 * assigned under a since-ended relationship still counts if the same coach
 * and player are active again under a new one.
 *
 * Scoped to `goal.assigned_by_user_id = <this coach>`: goals outlive the
 * relationship that created them, and `assignedByUserId` is nullable for
 * player-authored self-goals, so an unscoped join would count a previous
 * coach's goals and the player's own private goals in this coach's chip.
 *
 * `overdue` is computed against the COACH's local "today", not each
 * player's: this is one grouped query across the whole roster, and
 * per-player timezone lookups would turn it back into a loop. The coach is
 * the only viewer of this chip, so their own day boundary is the meaningful
 * one — and it beats the hardcoded UTC this previously used, which flagged
 * goals overdue up to a day early for anyone west of UTC. The individual
 * player views (`listMyGoals`/`listPlayerGoals`) remain the timezone-exact
 * source of truth; this chip is a rough-cut summary.
 *
 * Only returns rows for players with at least one goal — a player with none
 * has no row, and callers should treat a missing `playerUserId` as all
 * zeros.
 */
export async function getRosterGoalSummary(
  ctx: ServiceCtx,
): Promise<RosterGoalSummaryRow[]> {
  const authz = await requireRole(ctx, ["coach"]);
  // The coach is the caller here, so their own profile is the right (and
  // already-available) source for the day boundary.
  const coachProfile = await getOrCreateProfile(ctx);
  const today = localDateString(new Date(), coachProfile.timezone ?? "UTC");

  const rows = await ctx.db
    .select({
      playerUserId: CoachingRelationship.playerUserId,
      open: sql<string>`count(*) FILTER (WHERE ${Goal.status} = 'open')`,
      overdue: sql<string>`count(*) FILTER (WHERE ${Goal.status} = 'open' AND ${Goal.targetDate} < ${today})`,
      completed: sql<string>`count(*) FILTER (WHERE ${Goal.status} = 'completed')`,
    })
    .from(CoachingRelationship)
    .innerJoin(Goal, eq(Goal.playerUserId, CoachingRelationship.playerUserId))
    .where(
      and(
        eq(CoachingRelationship.coachUserId, authz.userId),
        eq(CoachingRelationship.status, "active"),
        eq(Goal.assignedByUserId, authz.userId),
      ),
    )
    .groupBy(CoachingRelationship.playerUserId);

  return rows.map((row) => ({
    playerUserId: row.playerUserId,
    open: Number(row.open),
    overdue: Number(row.overdue),
    completed: Number(row.completed),
  }));
}
