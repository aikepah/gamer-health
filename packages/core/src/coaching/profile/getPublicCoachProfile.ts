import { z } from "zod/v4";

import { eq } from "@gamer-health/db";
import { CoachProfile, Profile, user } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import type { CoachProfileDetail } from "./getOrCreateCoachProfile";
import { requireActiveUser } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";
import { buildCoachProfileDetail } from "./getOrCreateCoachProfile";

export const getPublicCoachProfileInput = z.object({
  coachUserId: z.string().min(1),
});
export type GetPublicCoachProfileInput = z.infer<
  typeof getPublicCoachProfileInput
>;

/**
 * Returns the profile only when it is published (and the target's role is
 * still `coach` and the account isn't deactivated), or when the caller is the
 * coach themselves. Otherwise `NOT_FOUND` — this never leaks whether an
 * unpublished profile exists (the same error covers "no such coach" and "not
 * published yet").
 */
export async function getPublicCoachProfile(
  ctx: ServiceCtx,
  input: GetPublicCoachProfileInput,
): Promise<CoachProfileDetail> {
  const authz = await requireActiveUser(ctx);
  const isSelf = authz.userId === input.coachUserId;

  const [userRow, profileRow, coachProfileRow] = await Promise.all([
    ctx.db.query.user.findFirst({
      where: eq(user.id, input.coachUserId),
      columns: { name: true },
    }),
    ctx.db.query.Profile.findFirst({
      where: eq(Profile.userId, input.coachUserId),
      columns: { timezone: true, role: true, deactivatedAt: true },
    }),
    ctx.db.query.CoachProfile.findFirst({
      where: eq(CoachProfile.userId, input.coachUserId),
    }),
  ]);

  if (!userRow || !coachProfileRow) {
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

  return buildCoachProfileDetail(
    ctx,
    input.coachUserId,
    { name: userRow.name, timezone: profileRow?.timezone ?? null },
    coachProfileRow,
  );
}
