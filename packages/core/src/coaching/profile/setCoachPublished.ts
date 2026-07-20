import { z } from "zod/v4";

import { count, eq } from "@gamer-health/db";
import {
  CoachAvailability,
  CoachGame,
  CoachProfile,
  Profile,
} from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";
import { ensureCoachProfileRow } from "./getOrCreateCoachProfile";

export const setCoachPublishedInput = z.object({ published: z.boolean() });
export type SetCoachPublishedInput = z.infer<typeof setCoachPublishedInput>;

/**
 * Flips `isPublished`. Publishing (`published: true`) enforces four
 * preconditions in core (not the DB), each a `BAD_REQUEST` naming the
 * specific missing piece: a non-null `profile.timezone`, a non-empty
 * `headline`, at least one game, and at least one availability block.
 * Unpublishing is always allowed and never touches existing relationships —
 * an unpublished coach keeps their roster.
 */
export async function setCoachPublished(
  ctx: ServiceCtx,
  input: SetCoachPublishedInput,
): Promise<{ isPublished: boolean }> {
  const authz = await requireRole(ctx, ["coach"]);
  const coachProfile = await ensureCoachProfileRow(ctx, authz.userId);

  if (input.published) {
    // Checked sequentially (not Promise.all) so an earlier failure short-
    // circuits before firing the later queries — each throws naming the
    // specific missing piece, in this fixed order.
    const profileRow = await ctx.db.query.Profile.findFirst({
      where: eq(Profile.userId, authz.userId),
      columns: { timezone: true },
    });
    if (!profileRow?.timezone) {
      throw new CoreError(
        "BAD_REQUEST",
        "Set your timezone before publishing your profile",
      );
    }
    if (!coachProfile.headline) {
      throw new CoreError(
        "BAD_REQUEST",
        "Add a headline before publishing your profile",
      );
    }

    const [gamesCountRow] = await ctx.db
      .select({ value: count() })
      .from(CoachGame)
      .where(eq(CoachGame.coachUserId, authz.userId));
    if ((gamesCountRow?.value ?? 0) === 0) {
      throw new CoreError(
        "BAD_REQUEST",
        "Add at least one game you coach before publishing your profile",
      );
    }

    const [availabilityCountRow] = await ctx.db
      .select({ value: count() })
      .from(CoachAvailability)
      .where(eq(CoachAvailability.coachUserId, authz.userId));
    if ((availabilityCountRow?.value ?? 0) === 0) {
      throw new CoreError(
        "BAD_REQUEST",
        "Add at least one availability block before publishing your profile",
      );
    }
  }

  const [updated] = await ctx.db
    .update(CoachProfile)
    .set({ isPublished: input.published })
    .where(eq(CoachProfile.userId, authz.userId))
    .returning({ isPublished: CoachProfile.isPublished });
  if (!updated) {
    throw new CoreError("NOT_FOUND", "Coach profile not found");
  }
  return updated;
}
