import { z } from "zod/v4";

import { and, count, eq, gt, lt, or } from "@gamer-health/db";
import { CoachingSession } from "@gamer-health/db/schema";

import type { ServiceCtx, TxDb } from "../../ctx";
import { CoreError } from "../../lib/errors";
import { getCoachAvailability } from "../profile/getCoachAvailability";
import { requireMyCoachRelationship } from "../relationships/getActiveRelationship";
import { isWithinAvailability, toLocalSlot } from "./availability";

export type CoachingSessionRow = typeof CoachingSession.$inferSelect;

/** Duration/horizon limits (docs/features/coaching-sessions.md). */
export const MIN_SESSION_MINUTES = 15;
export const MAX_SESSION_MINUTES = 240;
export const MAX_SCHEDULING_HORIZON_DAYS = 90;
/** At most this many outstanding `proposed` rows per player at once. */
export const MAX_OUTSTANDING_PROPOSALS = 5;

export const proposeCoachingSessionInput = z
  .object({
    startsAt: z.date(),
    endsAt: z.date(),
    // `.optional()` stays OUTERMOST: applying it before `.transform()` makes
    // the inferred key required-but-possibly-undefined, forcing every caller
    // (including the future AI tool layer) to pass `note: undefined`
    // explicitly. Transform first, then optional, so the key is truly
    // omittable while "" still normalizes away.
    note: z
      .string()
      .trim()
      .max(1000)
      .transform((value) => (value === "" ? undefined : value))
      .optional(),
  })
  .refine((input) => input.endsAt > input.startsAt, {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });
export type ProposeCoachingSessionInput = z.infer<
  typeof proposeCoachingSessionInput
>;

/**
 * Proposes a coaching session (#15): the player→coach direction only (see
 * "Fixed decisions" in the spec — `proposedByUserId` anticipates coach-
 * initiated proposals, but nothing writes that path yet).
 *
 * 1. `requireMyCoachRelationship` — FORBIDDEN if the caller has no active coach.
 * 2. Duration (15–240 min), future, and horizon (<= 90 days) validation —
 *    BAD_REQUEST, nothing written.
 * 3. Loads the coach's availability + timezone (#9 `getCoachAvailability`)
 *    and checks containment — BAD_REQUEST
 *    "That time is outside your coach's availability" if it fails.
 * 4. In one transaction: rejects if the slot overlaps a `confirmed` session
 *    for either the coach or the player (CONFLICT "Your coach is already
 *    booked then"), enforces the outstanding-proposals cap, then inserts.
 */
export async function proposeCoachingSession(
  ctx: ServiceCtx,
  input: ProposeCoachingSessionInput,
): Promise<CoachingSessionRow> {
  const rel = await requireMyCoachRelationship(ctx);

  const durationMinutes =
    (input.endsAt.getTime() - input.startsAt.getTime()) / 60_000;
  if (
    durationMinutes < MIN_SESSION_MINUTES ||
    durationMinutes > MAX_SESSION_MINUTES
  ) {
    throw new CoreError(
      "BAD_REQUEST",
      `A session must be between ${MIN_SESSION_MINUTES} and ${MAX_SESSION_MINUTES} minutes long`,
    );
  }

  const now = new Date();
  if (input.startsAt.getTime() <= now.getTime()) {
    throw new CoreError("BAD_REQUEST", "That time has already passed");
  }
  const horizonMs = MAX_SCHEDULING_HORIZON_DAYS * 24 * 60 * 60 * 1000;
  if (input.startsAt.getTime() - now.getTime() > horizonMs) {
    throw new CoreError(
      "BAD_REQUEST",
      `You can only schedule up to ${MAX_SCHEDULING_HORIZON_DAYS} days out`,
    );
  }

  const { timezone, blocks } = await getCoachAvailability(ctx, {
    coachUserId: rel.coachUserId,
  });
  if (!timezone) {
    throw new CoreError(
      "BAD_REQUEST",
      "Your coach hasn't set an availability timezone yet",
    );
  }
  const startSlot = toLocalSlot(input.startsAt, timezone);
  const endSlot = toLocalSlot(input.endsAt, timezone);
  if (!isWithinAvailability(blocks, startSlot, endSlot)) {
    throw new CoreError(
      "BAD_REQUEST",
      "That time is outside your coach's availability",
    );
  }

  return ctx.db.transaction(async (tx: TxDb) => {
    // Overlap vs the coach's confirmed sessions, and — cheaply, near-
    // redundant since a player has only one active coach — the player's own
    // confirmed sessions too. One query covers both (see spec).
    const overlapping = await tx.query.CoachingSession.findFirst({
      where: and(
        or(
          eq(CoachingSession.coachUserId, rel.coachUserId),
          eq(CoachingSession.playerUserId, rel.playerUserId),
        ),
        eq(CoachingSession.status, "confirmed"),
        lt(CoachingSession.startsAt, input.endsAt),
        gt(CoachingSession.endsAt, input.startsAt),
      ),
    });
    if (overlapping) {
      throw new CoreError("CONFLICT", "Your coach is already booked then");
    }

    const [outstanding] = await tx
      .select({ value: count() })
      .from(CoachingSession)
      .where(
        and(
          eq(CoachingSession.playerUserId, rel.playerUserId),
          eq(CoachingSession.status, "proposed"),
        ),
      );
    if ((outstanding?.value ?? 0) >= MAX_OUTSTANDING_PROPOSALS) {
      throw new CoreError(
        "CONFLICT",
        `You already have ${MAX_OUTSTANDING_PROPOSALS} pending proposals — wait for a response before proposing more`,
      );
    }

    const [inserted] = await tx
      .insert(CoachingSession)
      .values({
        relationshipId: rel.id,
        playerUserId: rel.playerUserId,
        coachUserId: rel.coachUserId,
        proposedByUserId: rel.playerUserId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: "proposed",
        note: input.note ?? null,
      })
      .returning();
    if (!inserted) {
      throw new CoreError("CONFLICT", "Failed to propose that session");
    }
    return inserted;
  });
}
