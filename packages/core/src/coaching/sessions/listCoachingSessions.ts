import { z } from "zod/v4";

import { and, asc, desc, eq, gte, inArray, lt, or } from "@gamer-health/db";
import { CoachingSession } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireActiveUser } from "../../authz/requireRole";
import type { CoachingSessionRow } from "./proposeCoachingSession";

export const listCoachingSessionsInput = z.object({
  scope: z.enum(["upcoming", "past"]).default("upcoming"),
  limit: z.number().int().min(1).max(100).default(50),
});
export type ListCoachingSessionsInput = z.infer<
  typeof listCoachingSessionsInput
>;

export interface CoachingSessionItem extends CoachingSessionRow {
  player: { userId: string; name: string };
  coach: { userId: string; name: string };
}

/**
 * The caller's coaching sessions (#15) — rows where they're the player OR
 * the coach, a single query that serves both sides. `upcoming`: `endsAt >=
 * now` and status `proposed`/`confirmed`, ascending. `past`: everything
 * else (cancelled/completed, or a proposed/confirmed row whose time already
 * passed), descending.
 */
export async function listCoachingSessions(
  ctx: ServiceCtx,
  input: ListCoachingSessionsInput,
): Promise<CoachingSessionItem[]> {
  const authz = await requireActiveUser(ctx);
  const now = new Date();

  const scopeCondition =
    input.scope === "upcoming"
      ? and(
          gte(CoachingSession.endsAt, now),
          inArray(CoachingSession.status, ["proposed", "confirmed"]),
        )
      : or(
          lt(CoachingSession.endsAt, now),
          inArray(CoachingSession.status, ["cancelled", "completed"]),
        );

  const rows = await ctx.db.query.CoachingSession.findMany({
    where: and(
      or(
        eq(CoachingSession.playerUserId, authz.userId),
        eq(CoachingSession.coachUserId, authz.userId),
      ),
      scopeCondition,
    ),
    orderBy:
      input.scope === "upcoming"
        ? [asc(CoachingSession.startsAt)]
        : [desc(CoachingSession.startsAt)],
    limit: input.limit,
    with: {
      player: { columns: { id: true, name: true } },
      coach: { columns: { id: true, name: true } },
    },
  });

  return rows.map((row) => ({
    ...row,
    player: { userId: row.player.id, name: row.player.name },
    coach: { userId: row.coach.id, name: row.coach.name },
  }));
}
