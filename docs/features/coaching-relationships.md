# Feature: Coaching Relationships & Roster (#11)

**MVP 2, wave 2 — the keystone: activates the `assertCoachOf` privacy gate.
Blocks #12, #13, #14, #15.**
Issue: [#11](https://github.com/aikepah/gamer-health/issues/11). Depends on #10.

## Goal

The player↔coach relationship lifecycle: a coach accepts or declines
applications and sees their roster; a player sees their coach and their
application statuses; either side can end an active relationship. Accepting is
what flips `coaching_relationship.status` to `active`, which is the single
state every other wave-2 feature — and `assertCoachOf` — keys on.

## Fixed decisions (architect — do not revisit)

### One active coach per player

A player has **at most one** `active` relationship, enforced by the partial
unique index `coaching_relationship_one_active_per_player_idx`. Rationale:

- Every issue in wave 2 is written in the singular ("their coach", "player
  sees their coach", "schedule sessions with their coach").
- It makes `assertCoachOf` a single-row lookup and removes the "which coach
  owns this goal / habit assignment / session" ambiguity from #13, #14 and #15
  entirely.
- Relaxing it later is additive (drop the index, add a coach selector);
  tightening it later would need a data migration.

A **coach** obviously has many active players — that's the roster.

### Multiple pending applications, auto-declined on acceptance

A player may hold several `applied` rows to different coaches at once (#10).
When one coach accepts, `acceptCoachApplication` **auto-declines the player's
other `applied` rows in the same transaction**, setting
`responseNote = "Player started coaching with another coach"` and
`respondedAt = now`. Without this, a second coach's accept would fail with an
opaque 23505 from the one-active index; with it, acceptance is deterministic
and every application reaches a terminal state.

### Rows are never deleted

`declined`, `ended` and `withdrawn` are terminal; the row is the history.
Re-applying to a coach after an `ended` relationship creates a **new** row —
the open-pair unique index only covers `applied`/`active`, so this is allowed.

### Payment gate insertion point (do NOT build)

`acceptCoachApplication` is the **only** writer of `status = 'active'` in the
entire codebase. A future subscription gate is a single call at the top of its
transaction (`await requireSubscriptionActive(ctx, relationship)`), optionally
with a `pending_payment` value appended to
`COACHING_RELATIONSHIP_STATUSES`. Keep it that way: never set `active` from
anywhere else, and do not add payment columns, states, or copy now.

### Ending

Either party may end an `active` relationship. Ending sets
`status='ended'`, `endedAt`, `endedByUserId`, `endReason`. It does **not**
delete or reassign anything:

- Goals (#13) survive — the player keeps them; the coach loses visibility.
- Coach-assigned habits (#14) survive — see that spec's unassign rule.
- Future `proposed`/`confirmed` coaching sessions (#15) ARE cancelled in the
  same transaction with `cancelReason = "Coaching relationship ended"`, since
  a session with no relationship is meaningless. #15 implements that block;
  until #15 lands, `endCoachingRelationship` has nothing to cancel.

## The `assertCoachOf` change — exact replacement

`packages/core/src/authz/assertCoachOf.ts` currently ships deny-all from #4.
Replace **only** the unconditional throw with the relationship lookup. The
signature, the `requireRole(ctx, ["coach"])` guard, the error code and the
error message are unchanged, so no call site moves. Note the parameter is
renamed from `_playerUserId` to `playerUserId` (it is now used).

```ts
import type { ServiceCtx } from "../ctx";
import { and, eq } from "@gamer-health/db";
import { CoachingRelationship } from "@gamer-health/db/schema";

import { CoreError } from "../lib/errors";
import { requireRole } from "./requireRole";

/**
 * Asserts the caller is an active coach with an ACTIVE coaching relationship
 * to `playerUserId`. This is the privacy gate for every coach-side view of
 * player data (#12–#15).
 *
 * Admins do not implicitly pass this check — only role "coach" does.
 * A player has at most one active coach, so this is a single-row lookup.
 */
export async function assertCoachOf(
  ctx: ServiceCtx,
  playerUserId: string,
): Promise<void> {
  const coach = await requireRole(ctx, ["coach"]);

  const relationship = await ctx.db.query.CoachingRelationship.findFirst({
    columns: { id: true },
    where: and(
      eq(CoachingRelationship.coachUserId, coach.userId),
      eq(CoachingRelationship.playerUserId, playerUserId),
      eq(CoachingRelationship.status, "active"),
    ),
  });
  if (!relationship) {
    throw new CoreError("FORBIDDEN", "No active coaching relationship");
  }
}
```

Update `packages/core/src/authz/assertCoachOf.test.ts` accordingly: keep the
existing cases (non-coach → FORBIDDEN; coach with no relationship →
FORBIDDEN) and add coach **with** an active relationship → resolves, plus
coach with an `applied`/`ended` relationship → FORBIDDEN, and coach A cannot
assert on coach B's player.

## Acceptance criteria

1. `/coach/roster` lists the coach's active players (name, since-date, quick
   links) and a separate "Applications" section with pending applicants,
   their message and applied-at, each with Accept and Decline.
2. Accepting flips the row to `active`, auto-declines that player's other
   pending applications, and the player immediately appears on the roster.
3. Declining sets `declined` with the optional reason; the applicant sees it
   on `/coaches`.
4. A coach cannot accept an application from a player who already has another
   active coach → `CONFLICT` with a clear message (not a DB error).
5. The player's dashboard shows a "My coach" card when active (coach name,
   headline, since-date, End button with a confirm dialog + optional reason)
   and an "Applications" summary otherwise.
6. Either side can end an active relationship; afterwards the coach's
   `assertCoachOf` calls for that player fail with FORBIDDEN again.
7. `assertCoachOf` unit tests cover all the cases listed above.

## Core services (`packages/core/src/coaching/relationships/`)

```ts
// getActiveRelationship.ts  (internal helper — the shared reader)
export type CoachingRelationshipRow = typeof CoachingRelationship.$inferSelect;
export async function findActiveRelationship(
  ctx: ServiceCtx, playerUserId: string, coachUserId: string,
): Promise<CoachingRelationshipRow | null>;
/** The caller's own active relationship AS PLAYER, or throw FORBIDDEN. */
export async function requireMyCoachRelationship(
  ctx: ServiceCtx,
): Promise<CoachingRelationshipRow>;
// requireActiveUser; single row with playerUserId = caller, status 'active';
// none → CoreError("FORBIDDEN", "You don't have a coach"). This is the
// player-side mirror of assertCoachOf; #13 and #15 both use it.

// acceptCoachApplication.ts
export const acceptCoachApplicationInput = z.object({ relationshipId: z.uuid() });
export async function acceptCoachApplication(ctx, input): Promise<CoachingRelationshipRow>;
// requireRole(ctx, ["coach"]).
// Row must exist (NOT_FOUND), have coachUserId === caller (NOT_FOUND — don't
// confirm other coaches' rows exist), and be status 'applied'
// (CONFLICT "This application has already been handled").
// Then, IN ONE TRANSACTION:
//   1. (payment gate insertion point — nothing today)
//   2. re-check the player has no status='active' row → CONFLICT
//      "This player already has a coach"
//   3. update this row: status 'active', respondedAt = now, startedAt = now
//   4. update the player's OTHER status='applied' rows → status 'declined',
//      respondedAt = now,
//      responseNote = "Player started coaching with another coach"
// Wrap in isUniqueViolation(err) → CONFLICT for the race on the one-active index.

// declineCoachApplication.ts
export const declineCoachApplicationInput = z.object({
  relationshipId: z.uuid(),
  reason: z.string().trim().max(500).optional(),
});
export async function declineCoachApplication(ctx, input): Promise<void>;
// Same ownership/status guards; status 'declined', respondedAt = now,
// responseNote = reason ?? null.

// endCoachingRelationship.ts
export const endCoachingRelationshipInput = z.object({
  relationshipId: z.uuid(),
  reason: z.string().trim().max(500).optional(),
});
export async function endCoachingRelationship(ctx, input): Promise<void>;
// requireActiveUser (NOT coachProcedure — the player ends it too).
// Row must exist and caller must be its playerUserId OR coachUserId
// (else NOT_FOUND); status must be 'active' (else CONFLICT).
// Transaction: status 'ended', endedAt = now, endedByUserId = caller,
// endReason = reason ?? null; then cancel future coaching sessions (#15 adds
// that statement — see "Ending" above).

// listCoachRoster.ts
export const listCoachRosterInput = z.object({
  status: z.enum(["active", "applied"]).default("active"),
});
export interface RosterEntry {
  relationshipId: string;
  status: CoachingRelationshipStatus;
  player: { userId: string; name: string; email: string };
  message: string | null;
  appliedAt: Date;
  startedAt: Date | null;
}
export async function listCoachRoster(ctx, input): Promise<RosterEntry[]>;
// requireRole coach; rows where coachUserId = caller and status = input.status,
// joined to `user`; active ordered by startedAt desc, applied by appliedAt asc
// (oldest application first — fairness).

// getMyCoach.ts
export interface MyCoachSummary {
  relationshipId: string;
  startedAt: Date | null;
  coach: { userId: string; name: string; headline: string | null;
           specialties: CoachSpecialty[] };
}
export async function getMyCoach(ctx): Promise<MyCoachSummary | null>;
// requireActiveUser; null (not an error) when the player has no active coach.
```

## tRPC routes (`packages/api/src/router/coaching/relationships.ts`, key `relationships`)

- `roster` — `coachProcedure.input(listCoachRosterInput).query`
- `accept`, `decline` — `coachProcedure.mutation`
- `end` — `protectedProcedure.mutation` (core decides which side is calling)
- `myCoach` — `protectedProcedure.query`

## UI surfaces

- `apps/nextjs/src/app/coach/roster/page.tsx` — Applications section
  (applicant name, message, applied date, Accept/Decline with a reason field
  in the decline dialog) and Roster section (player name, coaching-since,
  and — once #12/#13/#15 land — links to their pages). Toasts surface
  `CONFLICT` messages verbatim.
- Player "My coach" card on the dashboard: coach name/headline, since-date,
  End coaching button (confirm dialog + optional reason). When there's no
  active coach, the card shows pending application count and links to
  `/coaches`.
- Add "Roster" to the coach nav group.

## Seed additions

- Demo coach ↔ `demo` user (the primary demo player): an **active**
  relationship started 30 days ago. This is what makes every downstream
  coach-side feature (#12–#15) reachable from a fresh seed.
- Keep #10's pending applications from `player1`/`player2` so the
  Applications section is populated.
- One `ended` relationship (demo coach ↔ `player3`, ended 10 days ago) so
  terminal-state rendering is reachable.

## Non-goals

- No coach-initiated invitations of specific players (the `initiatedByUserId`
  column anticipates it; #6's admin invites are a different thing), no
  transfer of a player between coaches, no relationship notes/CRM, no email
  or in-app notifications, no payments/subscriptions, no multi-coach support,
  no re-open of an ended relationship (re-apply instead).

## Dependencies / provides

- Uses #10: `applied` rows. Uses #4: `requireRole`, `coachProcedure`.
- **Provides the ACTIVE relationship that `assertCoachOf` reads — every
  coach-side feature in #12–#15 is dead until this merges.** Also provides
  `findActiveRelationship`, `requireMyCoachRelationship`, `listCoachRoster`
  and the seeded active demo relationship.
