import { z } from "zod/v4";

import { asc, eq } from "@gamer-health/db";
import {
  CoachAvailability,
  CoachProfile,
  Profile,
} from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import type { AvailabilityBlock } from "./getOrCreateCoachProfile";
import { requireActiveUser } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";

export const getCoachAvailabilityInput = z.object({
  coachUserId: z.string().min(1),
});
export type GetCoachAvailabilityInput = z.infer<
  typeof getCoachAvailabilityInput
>;

/**
 * Any signed-in active user may read a PUBLISHED coach's availability
 * (discovery + #15 scheduling need it), plus the coach's own — otherwise
 * `NOT_FOUND` (never distinguishes "no such coach" from "not published").
 */
export async function getCoachAvailability(
  ctx: ServiceCtx,
  input: GetCoachAvailabilityInput,
): Promise<{ timezone: string; blocks: AvailabilityBlock[] }> {
  const authz = await requireActiveUser(ctx);
  const isSelf = authz.userId === input.coachUserId;

  const [profileRow, coachProfileRow] = await Promise.all([
    ctx.db.query.Profile.findFirst({
      where: eq(Profile.userId, input.coachUserId),
      columns: { timezone: true, role: true, deactivatedAt: true },
    }),
    ctx.db.query.CoachProfile.findFirst({
      where: eq(CoachProfile.userId, input.coachUserId),
      columns: { isPublished: true },
    }),
  ]);

  if (!coachProfileRow) {
    throw new CoreError("NOT_FOUND", "Coach not found");
  }
  if (!isSelf) {
    const visible =
      coachProfileRow.isPublished &&
      profileRow?.role === "coach" &&
      profileRow.deactivatedAt == null;
    if (!visible) {
      throw new CoreError("NOT_FOUND", "Coach not found");
    }
  }

  const blocks = await ctx.db.query.CoachAvailability.findMany({
    where: eq(CoachAvailability.coachUserId, input.coachUserId),
    orderBy: [
      asc(CoachAvailability.weekday),
      asc(CoachAvailability.startMinute),
    ],
  });

  return {
    timezone: profileRow?.timezone ?? "UTC",
    blocks: blocks.map((row) => ({
      id: row.id,
      weekday: row.weekday,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
    })),
  };
}
