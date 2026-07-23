import { and, eq, gt, lt } from "@gamer-health/db";
import { CoachingSession, user } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import type { AvailabilityBlock } from "../profile/getOrCreateCoachProfile";
import { CoreError } from "../../lib/errors";
import { getCoachAvailability } from "../profile/getCoachAvailability";
import { requireMyCoachRelationship } from "../relationships/getActiveRelationship";

/** How far out the slot picker looks for the coach's existing bookings. */
const SCHEDULING_WINDOW_DAYS = 14;

export interface SchedulingContext {
  coach: { userId: string; name: string; timezone: string };
  availability: AvailabilityBlock[];
  /** Coach's confirmed sessions in the next 14 days — times only, no player identities. */
  busy: { startsAt: Date; endsAt: Date }[];
}

/**
 * Everything the player's slot picker needs in one call (#15): the caller's
 * coach's weekly availability + timezone, and their confirmed bookings for
 * the next 14 days (times only — deliberately no other player's identity).
 * `requireMyCoachRelationship` throws FORBIDDEN when the caller has no
 * active coach.
 */
export async function getSchedulingContext(
  ctx: ServiceCtx,
): Promise<SchedulingContext> {
  const rel = await requireMyCoachRelationship(ctx);

  const { timezone, blocks } = await getCoachAvailability(ctx, {
    coachUserId: rel.coachUserId,
  });
  if (!timezone) {
    throw new CoreError(
      "BAD_REQUEST",
      "Your coach hasn't set an availability timezone yet",
    );
  }

  const coachUser = await ctx.db.query.user.findFirst({
    where: eq(user.id, rel.coachUserId),
    columns: { name: true },
  });

  const now = new Date();
  const horizon = new Date(
    now.getTime() + SCHEDULING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const busy = await ctx.db.query.CoachingSession.findMany({
    where: and(
      eq(CoachingSession.coachUserId, rel.coachUserId),
      eq(CoachingSession.status, "confirmed"),
      lt(CoachingSession.startsAt, horizon),
      gt(CoachingSession.endsAt, now),
    ),
    columns: { startsAt: true, endsAt: true },
  });

  return {
    coach: {
      userId: rel.coachUserId,
      name: coachUser?.name ?? "",
      timezone,
    },
    availability: blocks,
    busy,
  };
}
