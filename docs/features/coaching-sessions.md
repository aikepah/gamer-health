# Feature: Coaching Session Scheduling (#15)

**MVP 2, wave 2 — parallel-safe with #12/#13/#14 once #11 lands.**
Issue: [#15](https://github.com/aikepah/gamer-health/issues/15).
Depends on #9 (availability) and #11 (active relationship).

## Goal

A player proposes a coaching appointment inside their coach's published
availability; the coach confirms or declines; either side can cancel; both see
upcoming and past sessions.

## Fixed decisions (architect — do not revisit)

- **Player proposes, coach responds.** `coaching_session.proposedByUserId`
  exists so coach-proposed slots need no migration later, but MVP only
  implements the player→coach direction. *(The issue says "players schedule
  … coach confirms/declines"; flagged as an interpretation that coach-initiated
  proposals are out of scope.)*
- **No `declined` status.** A coach declining a proposal is a `cancelled` row
  with `confirmedAt IS NULL`; a cancellation after confirmation has
  `confirmedAt` set. `cancelledByUserId` says who did it. The UI derives the
  label ("Declined by coach" / "Cancelled by you" / …) from those three
  fields. Four statuses total: `proposed | confirmed | cancelled | completed`.
- **Availability validation** — a proposal is valid iff, after converting
  `startsAt`/`endsAt` into the **coach's** `profile.timezone`:
  1. both endpoints fall on the same local calendar day,
  2. `[localStartMinute, localEndMinute)` is fully contained in **one**
     `coach_availability` block for that weekday.
  Spanning two adjacent blocks or midnight is rejected — coaches who want a
  longer window make one longer block. Error:
  `BAD_REQUEST("That time is outside your coach's availability")`.
- **Duration and horizon:** ≥ 15 minutes, ≤ 240 minutes, `startsAt` strictly
  in the future, and no more than 90 days out. Reject with `BAD_REQUEST`.
- **Conflict rules (core, not the DB).** Postgres range-exclusion needs
  `btree_gist`, which `drizzle-kit push` can't express, so:
  - Proposing: reject if the coach has a **`confirmed`** session overlapping
    the requested range (`CONFLICT("Your coach is already booked then")`).
    Other `proposed` rows do NOT block — several players may want the same
    slot.
  - Confirming: re-check the same overlap (the authoritative check), then
    **auto-cancel** the coach's other `proposed` sessions overlapping the
    range, with `cancelReason = "Coach confirmed another session in this
    slot"`. Deterministic, and no proposal is left permanently unconfirmable.
  - Also reject a proposal overlapping the *player's* own `confirmed`
    sessions (cheap; the player has one coach, so this is near-redundant, but
    it keeps the rule symmetric).
  - Both checks run inside the mutating transaction.
- **Availability edits do not retro-invalidate confirmed sessions.** A coach
  who shrinks their availability keeps existing bookings; they cancel
  explicitly if they want them gone.
- **`completed` is explicit and coach-only** (`markSessionCompleted`, allowed
  once `startsAt` is in the past). The UI additionally groups past `confirmed`
  sessions under "Past" without mutating them.
- **Ending a relationship cancels future sessions.** Add to #11's
  `endCoachingRelationship` transaction: update this relationship's sessions
  with `status IN ('proposed','confirmed') AND startsAt > now()` to
  `cancelled`, `cancelledAt = now`, `cancelledByUserId = caller`,
  `cancelReason = "Coaching relationship ended"`. **This issue owns that
  edit** — if #11 already merged, add it here.

## Acceptance criteria

1. `/sessions/schedule` (player, requires an active coach) shows the coach's
   weekly availability and the next 14 days of slots, with already-confirmed
   times greyed out; picking one and submitting (with an optional agenda note)
   creates a `proposed` session.
2. Proposing a time outside availability, in the past, too short/long, or
   overlapping a confirmed booking fails with the specific message above and
   nothing is written.
3. `/coach/sessions` lists the coach's pending proposals (player, time,
   note) with Confirm/Decline, plus upcoming confirmed sessions.
4. Confirming auto-cancels the coach's other overlapping proposals; those
   players see the reason.
5. Either side can cancel a `proposed` or `confirmed` future session with an
   optional reason; both sides' lists update.
6. A player without an active coach cannot reach the scheduler (redirect +
   FORBIDDEN from the service).
7. Both sides see an Upcoming / Past split; the coach can mark a past
   confirmed session completed.
8. All times render in the **viewer's** timezone with the coach's timezone
   shown alongside when they differ.

## Core services (`packages/core/src/coaching/sessions/`)

```ts
export type CoachingSessionRow = typeof CoachingSession.$inferSelect;
export interface CoachingSessionItem extends CoachingSessionRow {
  player: { userId: string; name: string };
  coach: { userId: string; name: string };
}

// availability.ts  (pure helpers — unit-test these directly)
/** Minutes from local midnight for `instant` in `timeZone`, plus its weekday and local date. */
export function toLocalSlot(instant: Date, timeZone: string): {
  weekday: number; minute: number; date: string;
};
/** True iff [start,end) sits inside ONE block on that weekday. */
export function isWithinAvailability(
  blocks: AvailabilityBlock[], start: {weekday:number;minute:number;date:string},
  end: {weekday:number;minute:number;date:string},
): boolean;
// Same local date required; end.minute may be 1440 when the session ends at
// local midnight. Use localDateString / TZDate from lib/dates — never
// hand-rolled offset maths.

// proposeCoachingSession.ts
export const proposeCoachingSessionInput = z.object({
  startsAt: z.date(),
  endsAt: z.date(),
  note: z.string().trim().max(1000).optional(),
});
export async function proposeCoachingSession(ctx, input): Promise<CoachingSessionRow>;
// 1. const rel = await requireMyCoachRelationship(ctx)          // #11
// 2. duration/horizon/future validation (BAD_REQUEST)
// 3. load coach availability + coach timezone (#9 getCoachAvailability),
//    isWithinAvailability → BAD_REQUEST
// 4. transaction: overlap check vs the coach's `confirmed` sessions and the
//    player's own `confirmed` sessions → CONFLICT; then insert
//    { relationshipId: rel.id, playerUserId: rel.playerUserId,
//      coachUserId: rel.coachUserId, proposedByUserId: caller,
//      startsAt, endsAt, status: 'proposed', note }.
// Cap: at most 5 outstanding `proposed` sessions per player → CONFLICT.

// confirmCoachingSession.ts
export const confirmCoachingSessionInput = z.object({ sessionId: z.uuid() });
export async function confirmCoachingSession(ctx, input): Promise<CoachingSessionRow>;
// requireRole coach; row must exist with coachUserId === caller (NOT_FOUND) and
// status 'proposed' (CONFLICT); startsAt must still be in the future (CONFLICT
// "That slot has already passed"). Transaction: re-run the confirmed-overlap
// check → CONFLICT; set status 'confirmed', confirmedAt = now; auto-cancel the
// coach's other overlapping `proposed` rows as described above.

// cancelCoachingSession.ts
export const cancelCoachingSessionInput = z.object({
  sessionId: z.uuid(),
  reason: z.string().trim().max(500).optional(),
});
export async function cancelCoachingSession(ctx, input): Promise<void>;
// requireActiveUser; caller must be the row's player or coach (else NOT_FOUND);
// status must be 'proposed' or 'confirmed' (else CONFLICT). Set status
// 'cancelled', cancelledAt = now, cancelledByUserId = caller, cancelReason.
// A coach cancelling a `proposed` row IS the decline action — same service.

// markSessionCompleted.ts
export const markSessionCompletedInput = z.object({ sessionId: z.uuid() });
export async function markSessionCompleted(ctx, input): Promise<void>;
// requireRole coach; own row; status 'confirmed'; startsAt < now (else
// CONFLICT "That session hasn't happened yet"). status 'completed',
// completedAt = now.

// listCoachingSessions.ts
export const listCoachingSessionsInput = z.object({
  scope: z.enum(["upcoming", "past"]).default("upcoming"),
  limit: z.number().int().min(1).max(100).default(50),
});
export async function listCoachingSessions(ctx, input): Promise<CoachingSessionItem[]>;
// requireActiveUser; rows where playerUserId = caller OR coachUserId = caller
// — one query, works for both sides. upcoming: endsAt >= now AND status IN
// ('proposed','confirmed'), ascending. past: everything else, descending.

// getSchedulingContext.ts
export async function getSchedulingContext(ctx): Promise<{
  coach: { userId: string; name: string; timezone: string };
  availability: AvailabilityBlock[];
  /** Coach's confirmed sessions in the next 14 days — times only, no player identities. */
  busy: { startsAt: Date; endsAt: Date }[];
}>;
// requireMyCoachRelationship; everything the slot picker needs in one call.
// `busy` deliberately exposes NO other player's identity.
```

## tRPC routes (`packages/api/src/router/coaching/sessions.ts`, key `sessions`)

- `list` — `protectedProcedure.query` (both sides)
- `schedulingContext`, `propose` — `protectedProcedure` (player; core enforces
  the relationship)
- `cancel` — `protectedProcedure.mutation` (either side)
- `confirm`, `markCompleted` — `coachProcedure.mutation`

## UI surfaces

- `apps/nextjs/src/app/sessions/schedule/page.tsx` (player) — next-14-days
  slot picker built from `schedulingContext` (availability minus `busy`,
  30-minute granularity, duration select 30/45/60), agenda note, submit.
  Redirect to `/coaches` when there's no active coach.
- `apps/nextjs/src/app/sessions/page.tsx` (player) — Upcoming / Past lists
  with status badges and Cancel.
- `apps/nextjs/src/app/coach/sessions/page.tsx` — Proposals (Confirm/Decline
  with reason), Upcoming confirmed, Past (Mark completed).
- Upcoming-session widget on the player dashboard and on
  `/coach/players/[playerUserId]`.
- Nav: "Sessions" for players (when they have a coach), "Sessions" in the
  coach group.
- A shared `formatSessionWindow(startsAt, endsAt, viewerTz, coachTz)` UI
  helper handles the dual-timezone label.

## Seed additions

For the seeded active relationship (demo coach ↔ demo player), anchored
relative to seed run time so they never go stale:

- one `proposed` session 3 days out, inside the coach's Wed 17:00–20:00 block,
- one `confirmed` session 5 days out,
- one `completed` session 7 days ago,
- one `cancelled` (declined: `confirmedAt` null, cancelled by the coach) 2
  days ago.

Also a `proposed` session from `player1` — which requires `player1` to have an
active relationship; if #11's seed left them merely `applied`, seed a second
active relationship (demo coach ↔ `player1`) instead of changing the
application data. Coordinate with #11's spec and note the choice in the PR.

## Non-goals

- No video calls, meeting links, or calendar (ICS/Google) integration; no
  reminders, emails, or push notifications; no recurring/repeating
  appointments; no rescheduling as a first-class action (cancel + propose);
  no coach-initiated proposals; no date-specific availability exceptions or
  time-off; no buffers between sessions; no payments or session credits; no
  session notes/summaries after the fact; no timezone conversion of the
  coach's availability editor (that stays coach-local, per #9).

## Dependencies / provides

- Uses #9 (`getCoachAvailability`, coach timezone) and #11
  (`requireMyCoachRelationship`, `assertCoachOf`, active relationship,
  `endCoachingRelationship` — which this issue extends).
- Provides the upcoming-session widget consumed by the player dashboard and
  #12's player page.
