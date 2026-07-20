import { z } from "zod/v4";

import { and, eq } from "@gamer-health/db";
import { CoachingRelationship } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";

export const declineCoachApplicationInput = z.object({
  relationshipId: z.uuid(),
  reason: z.string().trim().max(500).optional(),
});
export type DeclineCoachApplicationInput = z.infer<
  typeof declineCoachApplicationInput
>;

/**
 * Declines a pending application (#11). Same ownership/status guards as
 * `acceptCoachApplication`: the row must exist and belong to the caller as
 * coach (else `NOT_FOUND`), and must currently be `applied` (else
 * `CONFLICT`).
 */
export async function declineCoachApplication(
  ctx: ServiceCtx,
  input: DeclineCoachApplicationInput,
): Promise<void> {
  const authz = await requireRole(ctx, ["coach"]);

  const row = await ctx.db.query.CoachingRelationship.findFirst({
    where: eq(CoachingRelationship.id, input.relationshipId),
  });
  if (!row || row.coachUserId !== authz.userId) {
    throw new CoreError("NOT_FOUND", "Application not found");
  }
  if (row.status !== "applied") {
    throw new CoreError(
      "CONFLICT",
      "This application has already been handled",
    );
  }

  // Conditional on id + still `applied`: the read above isn't atomic with
  // this write, and an accept/withdraw could race it. Zero updated rows
  // means we lost that race.
  const updated = await ctx.db
    .update(CoachingRelationship)
    .set({
      status: "declined",
      respondedAt: new Date(),
      responseNote: input.reason ?? null,
    })
    .where(
      and(
        eq(CoachingRelationship.id, input.relationshipId),
        eq(CoachingRelationship.status, "applied"),
      ),
    )
    .returning({ id: CoachingRelationship.id });

  if (updated.length === 0) {
    throw new CoreError(
      "CONFLICT",
      "This application has already been handled",
    );
  }
}
