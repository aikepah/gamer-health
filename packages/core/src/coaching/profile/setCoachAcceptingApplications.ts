import { z } from "zod/v4";

import { eq } from "@gamer-health/db";
import { CoachProfile } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";
import { ensureCoachProfileRow } from "./getOrCreateCoachProfile";

export const setCoachAcceptingApplicationsInput = z.object({
  accepting: z.boolean(),
});
export type SetCoachAcceptingApplicationsInput = z.infer<
  typeof setCoachAcceptingApplicationsInput
>;

/**
 * Flips `acceptingApplications`. No preconditions (unlike `setCoachPublished`)
 * — a coach can close applications independently of being listed at all.
 */
export async function setCoachAcceptingApplications(
  ctx: ServiceCtx,
  input: SetCoachAcceptingApplicationsInput,
): Promise<{ acceptingApplications: boolean }> {
  const authz = await requireRole(ctx, ["coach"]);
  await ensureCoachProfileRow(ctx, authz.userId);

  const [updated] = await ctx.db
    .update(CoachProfile)
    .set({ acceptingApplications: input.accepting })
    .where(eq(CoachProfile.userId, authz.userId))
    .returning({ acceptingApplications: CoachProfile.acceptingApplications });
  if (!updated) {
    throw new CoreError("NOT_FOUND", "Coach profile not found");
  }
  return updated;
}
