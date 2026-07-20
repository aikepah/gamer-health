import type { ServiceCtx } from "../ctx";
import { and, eq } from "@gamer-health/db";
import { CoachingRelationship } from "@gamer-health/db/schema";

import { CoreError } from "../lib/errors";
import { requireRole } from "./requireRole";

/**
 * Asserts the caller is an active coach with an ACTIVE coaching relationship
 * to `playerUserId`. This is the privacy gate for every coach-side view of
 * player data (#12–#15).
 *
 * Admins do not implicitly pass this check — only role "coach" does.
 * A player has at most one active coach, so this is a single-row lookup.
 */
export async function assertCoachOf(
  ctx: ServiceCtx,
  playerUserId: string,
): Promise<void> {
  const coach = await requireRole(ctx, ["coach"]);

  const relationship = await ctx.db.query.CoachingRelationship.findFirst({
    columns: { id: true },
    where: and(
      eq(CoachingRelationship.coachUserId, coach.userId),
      eq(CoachingRelationship.playerUserId, playerUserId),
      eq(CoachingRelationship.status, "active"),
    ),
  });
  if (!relationship) {
    throw new CoreError("FORBIDDEN", "No active coaching relationship");
  }
}
