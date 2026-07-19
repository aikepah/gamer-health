import { z } from "zod/v4";

import { eq } from "@gamer-health/db";
import { CoachProfile } from "@gamer-health/db/schema";
import { COACH_SPECIALTIES } from "@gamer-health/validators";

import type { ServiceCtx } from "../../ctx";
import type { CoachProfileDetail } from "./getOrCreateCoachProfile";
import { requireRole } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";
import {
  buildCoachProfileDetail,
  ensureCoachProfileRow,
  fetchCoachIdentity,
} from "./getOrCreateCoachProfile";

export const updateCoachProfileInput = z.object({
  headline: z.string().trim().min(1).max(120).nullish(),
  bio: z.string().max(4000).nullish(),
  specialties: z.array(z.enum(COACH_SPECIALTIES)).max(8).default([]),
});
export type UpdateCoachProfileInput = z.infer<typeof updateCoachProfileInput>;

/**
 * Updates the caller's headline/bio/specialties, creating the
 * `coach_profile` row first if this is their first edit.
 */
export async function updateCoachProfile(
  ctx: ServiceCtx,
  input: UpdateCoachProfileInput,
): Promise<CoachProfileDetail> {
  const authz = await requireRole(ctx, ["coach"]);
  await ensureCoachProfileRow(ctx, authz.userId);

  const [updated] = await ctx.db
    .update(CoachProfile)
    .set({
      headline: input.headline ?? null,
      bio: input.bio ?? null,
      specialties: input.specialties,
    })
    .where(eq(CoachProfile.userId, authz.userId))
    .returning();
  if (!updated) {
    throw new CoreError("NOT_FOUND", "Coach profile not found");
  }

  const identity = await fetchCoachIdentity(ctx, authz.userId);
  if (!identity) {
    throw new CoreError("NOT_FOUND", "User not found");
  }
  return buildCoachProfileDetail(ctx, authz.userId, identity, updated);
}
