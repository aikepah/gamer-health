import { and, eq, sql } from "@gamer-health/db";
import { CoachingRelationship, Goal } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { localDateString } from "../../lib/dates";

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
 * `overdue` is computed against UTC "today" rather than each player's own
 * timezone: this is a single aggregate query across the whole roster, and
 * per-player timezone lookups would turn it back into a loop. The
 * individual player views (`listMyGoals`/`listPlayerGoals`) are the
 * timezone-accurate source of truth; this chip is a rough-cut summary.
 *
 * Only returns rows for players with at least one goal — a player with none
 * has no row, and callers should treat a missing `playerUserId` as all
 * zeros.
 */
export async function getRosterGoalSummary(
  ctx: ServiceCtx,
): Promise<RosterGoalSummaryRow[]> {
  const authz = await requireRole(ctx, ["coach"]);
  const today = localDateString(new Date(), "UTC");

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
