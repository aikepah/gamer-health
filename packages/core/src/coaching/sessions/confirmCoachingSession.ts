import { z } from "zod/v4";

import { and, eq, gt, lt, ne, sql } from "@gamer-health/db";
import { CoachingSession } from "@gamer-health/db/schema";

import type { ServiceCtx, TxDb } from "../../ctx";
import type { CoachingSessionRow } from "./proposeCoachingSession";
import { requireRole } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";

/**
 * Advisory-lock namespace for coach-schedule mutations. Advisory locks share
 * one global 64-bit space, so the two-int form namespaces this feature's
 * locks away from any other subsystem that starts using them.
 */
const COACH_SCHEDULE_LOCK_NAMESPACE = 4712;

export const confirmCoachingSessionInput = z.object({ sessionId: z.uuid() });
export type ConfirmCoachingSessionInput = z.infer<
  typeof confirmCoachingSessionInput
>;

/**
 * Coach confirms a `proposed` session (#15). Row must exist and belong to
 * the caller as coach (NOT_FOUND — never confirms other coaches' rows
 * exist), be `proposed` (CONFLICT), and still be in the future (CONFLICT
 * "That slot has already passed").
 *
 * Inside one transaction: re-runs the confirmed-overlap check (the
 * authoritative one — the pre-transaction reads above aren't atomic with
 * this write), conditionally flips this row to `confirmed` (id + still-
 * `proposed`; zero rows means we lost a race), then auto-cancels the
 * coach's OTHER `proposed` rows that overlap the now-confirmed slot, so no
 * proposal is left permanently unconfirmable.
 */
export async function confirmCoachingSession(
  ctx: ServiceCtx,
  input: ConfirmCoachingSessionInput,
): Promise<CoachingSessionRow> {
  const authz = await requireRole(ctx, ["coach"]);

  const row = await ctx.db.query.CoachingSession.findFirst({
    where: eq(CoachingSession.id, input.sessionId),
  });
  if (!row || row.coachUserId !== authz.userId) {
    throw new CoreError("NOT_FOUND", "Session not found");
  }
  if (row.status !== "proposed") {
    throw new CoreError("CONFLICT", "This session is no longer pending");
  }
  if (row.startsAt.getTime() <= Date.now()) {
    throw new CoreError("CONFLICT", "That slot has already passed");
  }

  return ctx.db.transaction(async (tx: TxDb) => {
    // Serialize all confirms for THIS coach for the life of the transaction.
    //
    // Without it the overlap check below is a plain SELECT under READ
    // COMMITTED, and the conditional UPDATE only guards the row's own
    // status — so two concurrent confirms of two different overlapping
    // proposals both see "no confirmed overlap", both flip their own row,
    // and the coach ends up double-booked. Unlike the one-active-coach
    // invariant, there's no unique index to catch it: excluding overlapping
    // ranges needs a btree_gist EXCLUDE constraint, which drizzle-kit push
    // can't express (see the note at schema.ts `coaching_session`).
    //
    // The lock is keyed on the coach, so confirms for different coaches
    // never contend, and it releases automatically at commit or rollback.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${COACH_SCHEDULE_LOCK_NAMESPACE}, hashtext(${authz.userId}))`,
    );

    const overlapping = await tx.query.CoachingSession.findFirst({
      where: and(
        eq(CoachingSession.coachUserId, authz.userId),
        eq(CoachingSession.status, "confirmed"),
        ne(CoachingSession.id, row.id),
        lt(CoachingSession.startsAt, row.endsAt),
        gt(CoachingSession.endsAt, row.startsAt),
      ),
    });
    if (overlapping) {
      // Coach-facing copy: confirm is called by the coach, unlike propose's
      // player-facing "Your coach is already booked then".
      throw new CoreError(
        "CONFLICT",
        "You already have a confirmed session in that slot",
      );
    }

    const now = new Date();
    const [confirmed] = await tx
      .update(CoachingSession)
      .set({ status: "confirmed", confirmedAt: now })
      .where(
        and(
          eq(CoachingSession.id, input.sessionId),
          eq(CoachingSession.status, "proposed"),
        ),
      )
      .returning();
    if (!confirmed) {
      throw new CoreError("CONFLICT", "This session is no longer pending");
    }

    // Deterministic: no proposal is left permanently unconfirmable.
    await tx
      .update(CoachingSession)
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancelledByUserId: authz.userId,
        cancelReason: "Coach confirmed another session in this slot",
      })
      .where(
        and(
          eq(CoachingSession.coachUserId, authz.userId),
          eq(CoachingSession.status, "proposed"),
          ne(CoachingSession.id, confirmed.id),
          lt(CoachingSession.startsAt, confirmed.endsAt),
          gt(CoachingSession.endsAt, confirmed.startsAt),
        ),
      );

    return confirmed;
  });
}
