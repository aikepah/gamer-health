import { z } from "zod/v4";

import { and, eq, ne } from "@gamer-health/db";
import { CoachingRelationship } from "@gamer-health/db/schema";

import type { ServiceCtx, TxDb } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { CoreError, isUniqueViolation } from "../../lib/errors";
import type { CoachingRelationshipRow } from "./getActiveRelationship";

export const acceptCoachApplicationInput = z.object({
  relationshipId: z.uuid(),
});
export type AcceptCoachApplicationInput = z.infer<
  typeof acceptCoachApplicationInput
>;

/**
 * Accepts a pending application (#11). This is the ONLY place `status`
 * becomes `active` anywhere in the codebase — see the payment-gate insertion
 * point in docs/features/coaching-relationships.md; a future subscription
 * check goes at the top of this transaction.
 *
 * Guards before the transaction: the row must exist and belong to the
 * caller as coach (else `NOT_FOUND` — never confirms other coaches' rows
 * exist), and must currently be `applied` (else `CONFLICT`).
 *
 * Inside ONE transaction:
 *   1. (payment gate insertion point — nothing today)
 *   2. re-checks the player has no OTHER active coach -> `CONFLICT` "This
 *      player already has a coach" (the one-active-per-player invariant,
 *      checked here so the error is a clean CONFLICT rather than an opaque
 *      23505 from the partial unique index)
 *   3. conditionally flips this row to `active` (id + still-`applied`),
 *      zero rows updated -> `CONFLICT` (lost a race with a concurrent
 *      decline/withdraw)
 *   4. auto-declines the player's OTHER `applied` rows, so a second coach's
 *      accept can never fail with that same opaque unique-violation instead
 *      it just finds no `applied` row left to accept.
 */
export async function acceptCoachApplication(
  ctx: ServiceCtx,
  input: AcceptCoachApplicationInput,
): Promise<CoachingRelationshipRow> {
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

  try {
    return await ctx.db.transaction(async (tx: TxDb) => {
      // 2. Re-checked inside the transaction so it's consistent with the
      // write below — the read above is not atomic with either.
      const existingActive = await tx.query.CoachingRelationship.findFirst({
        where: and(
          eq(CoachingRelationship.playerUserId, row.playerUserId),
          eq(CoachingRelationship.status, "active"),
        ),
      });
      if (existingActive) {
        throw new CoreError("CONFLICT", "This player already has a coach");
      }

      const now = new Date();
      // 3. Conditional on id + still `applied`: a concurrent decline or
      // withdraw between the read above and here would otherwise be
      // silently clobbered. Zero updated rows means we lost that race.
      const [accepted] = await tx
        .update(CoachingRelationship)
        .set({ status: "active", respondedAt: now, startedAt: now })
        .where(
          and(
            eq(CoachingRelationship.id, input.relationshipId),
            eq(CoachingRelationship.status, "applied"),
          ),
        )
        .returning();
      if (!accepted) {
        throw new CoreError(
          "CONFLICT",
          "This application has already been handled",
        );
      }

      // 4. Auto-decline the player's other open applications so a second
      // coach's later accept finds nothing `applied` left to race against.
      await tx
        .update(CoachingRelationship)
        .set({
          status: "declined",
          respondedAt: now,
          responseNote: "Player started coaching with another coach",
        })
        .where(
          and(
            eq(CoachingRelationship.playerUserId, row.playerUserId),
            eq(CoachingRelationship.status, "applied"),
            ne(CoachingRelationship.id, input.relationshipId),
          ),
        );

      return accepted;
    });
  } catch (err) {
    // Belt-and-suspenders for the one-active-per-player partial unique
    // index: the check in step 2 closes the window in the common case, but
    // two concurrent accepts for the same player can still both pass it and
    // race the UPDATE itself.
    if (isUniqueViolation(err)) {
      throw new CoreError("CONFLICT", "This player already has a coach");
    }
    throw err;
  }
}
