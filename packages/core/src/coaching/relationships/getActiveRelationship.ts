import { and, eq } from "@gamer-health/db";
import { CoachingRelationship } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireActiveUser } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";

export type CoachingRelationshipRow = typeof CoachingRelationship.$inferSelect;

/**
 * Internal helper — the shared reader behind `assertCoachOf` and
 * `requireMyCoachRelationship`: is there an ACTIVE relationship between this
 * exact player and this exact coach. Returns the full row (not just
 * existence) since #13/#15 need `id`/`startedAt` from it.
 */
export async function findActiveRelationship(
  ctx: ServiceCtx,
  playerUserId: string,
  coachUserId: string,
): Promise<CoachingRelationshipRow | null> {
  const row = await ctx.db.query.CoachingRelationship.findFirst({
    where: and(
      eq(CoachingRelationship.playerUserId, playerUserId),
      eq(CoachingRelationship.coachUserId, coachUserId),
      eq(CoachingRelationship.status, "active"),
    ),
  });
  return row ?? null;
}

/**
 * The caller's own active relationship AS PLAYER, or `CoreError("FORBIDDEN",
 * "You don't have a coach")`. The player-side mirror of `assertCoachOf` — #13
 * and #15 both use it to find "my coach" without re-deriving the lookup.
 */
export async function requireMyCoachRelationship(
  ctx: ServiceCtx,
): Promise<CoachingRelationshipRow> {
  const authz = await requireActiveUser(ctx);

  const row = await ctx.db.query.CoachingRelationship.findFirst({
    where: and(
      eq(CoachingRelationship.playerUserId, authz.userId),
      eq(CoachingRelationship.status, "active"),
    ),
  });
  if (!row) {
    throw new CoreError("FORBIDDEN", "You don't have a coach");
  }
  return row;
}
