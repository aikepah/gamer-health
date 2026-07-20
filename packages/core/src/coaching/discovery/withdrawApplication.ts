import { z } from "zod/v4";

import { and, eq } from "@gamer-health/db";
import { CoachingRelationship } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireActiveUser } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";

export const withdrawApplicationInput = z.object({
  relationshipId: z.uuid(),
});
export type WithdrawApplicationInput = z.infer<typeof withdrawApplicationInput>;

/**
 * Withdraws the caller's own pending application (#10). `NOT_FOUND` if the
 * row doesn't exist or doesn't belong to the caller as player (never
 * distinguishes the two, same convention as `getPublicCoachProfile`).
 * `CONFLICT` if it isn't currently `applied` (already responded to, or
 * already withdrawn).
 */
export async function withdrawApplication(
  ctx: ServiceCtx,
  input: WithdrawApplicationInput,
): Promise<void> {
  const authz = await requireActiveUser(ctx);

  const row = await ctx.db.query.CoachingRelationship.findFirst({
    where: eq(CoachingRelationship.id, input.relationshipId),
  });
  if (!row || row.playerUserId !== authz.userId) {
    throw new CoreError("NOT_FOUND", "Application not found");
  }
  if (row.status !== "applied") {
    throw new CoreError(
      "CONFLICT",
      "This application can no longer be withdrawn",
    );
  }

  // Conditional on the row still being this caller's `applied` row: the read
  // above is not atomic with this write, and #11 adds accept/decline, which
  // race directly with withdraw. Scoped by id alone, a coach accepting between
  // the read and the write would have their `active` relationship silently
  // flipped to `withdrawn`. Zero updated rows means we lost that race.
  const updated = await ctx.db
    .update(CoachingRelationship)
    .set({ status: "withdrawn", respondedAt: new Date() })
    .where(
      and(
        eq(CoachingRelationship.id, input.relationshipId),
        eq(CoachingRelationship.playerUserId, authz.userId),
        eq(CoachingRelationship.status, "applied"),
      ),
    )
    .returning({ id: CoachingRelationship.id });

  if (updated.length === 0) {
    throw new CoreError(
      "CONFLICT",
      "This application can no longer be withdrawn",
    );
  }
}
