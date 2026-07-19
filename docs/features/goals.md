# Feature: Goals — Coach Assignment & Player Tracking (#13)

**MVP 2, wave 2 — parallel-safe with #12/#14/#15 once #11 lands.**
Issue: [#13](https://github.com/aikepah/gamer-health/issues/13). Depends on #11.

## Goal

Coaches assign goals (title, description, target date) to roster players;
players track them by changing status and writing a progress note; the coach
sees status across the whole roster.

## Fixed decisions (architect — do not revisit)

- **Status is exactly `open | completed | abandoned`** (`goal_status` enum).
  No percentages, no milestones, no sub-tasks. "Tracking progress" in MVP =
  a status change plus a free-text `progressNote` the player edits.
  *(Interpretation of "players see and update progress" in the issue — flagged
  for the user.)*
- **`closedAt` mirrors status** and is DB-checked:
  `(status = 'open') = (closedAt IS NULL)`. Set it whenever status leaves
  `open`, clear it on reopen. A builder who forgets will get a constraint
  violation, which is the point.
- **Goals are coach-assigned only in MVP.** `goal.assignedByUserId` is
  nullable purely so a deleted coach account doesn't take the player's goals
  with it (and so post-MVP self-goals need no migration). #13 always sets it.
- **Goals survive the relationship ending.** The player keeps the row and can
  still complete/abandon it; the coach simply can't see or edit it any more
  (`assertCoachOf` fails). No cleanup job, no cascade. `relationshipId` is
  `ON DELETE SET NULL` for the same reason.
- **Write split:**
  - coach: create, edit title/description/targetDate, delete (only while
    `open` — a completed goal is history), and set status.
  - player: set status, edit `progressNote`. Never edits title/description/
    targetDate, never deletes.
  Both sides changing status is deliberate: a coach marking a goal complete
  during a session is a normal flow.
- **Authorization pattern:** coach-side services call
  `assertCoachOf(ctx, goal.playerUserId)` **after** loading the goal (the goal
  row is what names the player). Player-side services check
  `goal.playerUserId === requireUserId(ctx)`.

## Acceptance criteria

1. On `/coach/players/[playerUserId]`, a Goals panel lists that player's goals
   grouped by status, with an "Assign goal" dialog (title required,
   description and target date optional).
2. The coach can edit and delete an open goal, and mark any goal
   completed/abandoned or reopen it.
3. `/goals` (player) lists the player's goals — open first, sorted by target
   date with overdue ones flagged — with Complete / Abandon / Reopen actions
   and an inline editable progress note that autosaves.
4. `/coach/roster` shows a per-player goal summary chip (`3 open · 1 overdue`).
5. A coach cannot see or touch a non-roster player's goals (FORBIDDEN), and a
   player cannot touch another player's goal (NOT_FOUND).
6. After a relationship ends, the player still sees and can update their
   goals; the coach's requests for them fail with FORBIDDEN.

## Core services (`packages/core/src/coaching/goals/`)

```ts
export interface GoalRow {
  id: string; playerUserId: string; assignedByUserId: string | null;
  relationshipId: string | null; title: string; description: string | null;
  targetDate: string | null;            // "YYYY-MM-DD"
  status: GoalStatus; progressNote: string | null;
  closedAt: Date | null; createdAt: Date; updatedAt: Date;
}

// createGoal.ts
export const createGoalInput = z.object({
  playerUserId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(2000).nullish(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});
export async function createGoal(ctx, input): Promise<GoalRow>;
// assertCoachOf(ctx, input.playerUserId); load the active relationship
// (findActiveRelationship from #11) to stamp relationshipId; insert with
// status 'open', assignedByUserId = caller. Cap: a player may have at most
// 50 open goals → CONFLICT beyond that (cheap guard against runaway UIs).

// updateGoal.ts
export const updateGoalInput = z.object({
  goalId: z.uuid(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(2000).nullish(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});
export async function updateGoal(ctx, input): Promise<GoalRow>;
// Load goal (NOT_FOUND); assertCoachOf(ctx, goal.playerUserId); patch only the
// provided keys.

// setGoalStatus.ts
export const setGoalStatusInput = z.object({
  goalId: z.uuid(),
  status: z.enum(GOAL_STATUSES),
});
export async function setGoalStatus(ctx, input): Promise<GoalRow>;
// requireActiveUser. Load goal (NOT_FOUND). Authorized if
// goal.playerUserId === caller, OR assertCoachOf succeeds for it (try/catch
// the CoreError and rethrow as FORBIDDEN — do not leak which branch failed).
// Set closedAt = (status === 'open' ? null : now). Same status → no-op return.

// updateGoalProgress.ts
export const updateGoalProgressInput = z.object({
  goalId: z.uuid(),
  progressNote: z.string().max(2000).nullish(),
});
export async function updateGoalProgress(ctx, input): Promise<GoalRow>;
// Player-only: goal.playerUserId must equal requireUserId(ctx) (else NOT_FOUND).

// deleteGoal.ts
export const deleteGoalInput = z.object({ goalId: z.uuid() });
export async function deleteGoal(ctx, input): Promise<void>;
// Coach-only: assertCoachOf; status must be 'open' (else CONFLICT
// "Completed goals can't be deleted").

// listMyGoals.ts
export const listMyGoalsInput = z.object({
  status: z.enum(GOAL_STATUSES).optional(),
});
export interface GoalListItem extends GoalRow {
  assignedBy: { userId: string; name: string } | null;
  /** targetDate < today (player's timezone) && status === 'open'. */
  overdue: boolean;
}
export async function listMyGoals(ctx, input): Promise<GoalListItem[]>;
// requireActiveUser; caller's goals; open first, then targetDate asc nulls
// last, then createdAt desc. `overdue` computed with localDateString against
// the caller's profile timezone.

// listPlayerGoals.ts
export const listPlayerGoalsInput = z.object({
  playerUserId: z.string().min(1),
  status: z.enum(GOAL_STATUSES).optional(),
});
export async function listPlayerGoals(ctx, input): Promise<GoalListItem[]>;
// assertCoachOf, then the same query/ordering for that player (overdue is
// computed against the PLAYER's timezone).

// getRosterGoalSummary.ts
export async function getRosterGoalSummary(ctx): Promise<{
  playerUserId: string; open: number; overdue: number; completed: number;
}[]>;
// requireRole coach; one grouped query over goal JOIN coaching_relationship
// (status 'active', coachUserId = caller) — NOT a per-player loop.
```

## tRPC routes (`packages/api/src/router/coaching/goals.ts`, key `goals`)

- `create`, `update`, `delete`, `listForPlayer`, `rosterSummary` —
  `coachProcedure`
- `setStatus` — `protectedProcedure` (either side)
- `listMine`, `updateProgress` — `protectedProcedure`

## UI surfaces

- Goals panel on `/coach/players/[playerUserId]` (coordinate with #12: if #12
  landed first, add a section to its page; if not, create the page with just
  this panel). Assign-goal dialog, per-goal edit/delete/status menu.
- `apps/nextjs/src/app/goals/page.tsx` (player): grouped list, overdue badge,
  status actions, inline progress-note textarea with debounced save, empty
  state pointing at `/coaches` when the player has no coach.
- "Goals" entry in the player nav (visible to everyone — a player with no
  coach just sees the empty state).
- Goal summary chip on each `/coach/roster` row.

## Seed additions

For the seeded active relationship (demo coach ↔ demo player): four goals —
one `open` with a future target date and a progress note, one `open` and
overdue, one `completed`, one `abandoned` — so every UI state is reachable
from a fresh seed. Give `player1` none (empty-state coverage).

## Non-goals

- No numeric/percentage progress, milestones, or checklists; no goal
  templates or a goal library; no linking goals to habits (#14) or sessions
  (#15); no reminders/notifications; no XP or gamification hooks on goal
  completion (gamification is event-driven — if that's wanted later, emit a
  reward event, don't hand-award); no player-authored goals; no attachments
  or comment threads.

## Dependencies / provides

- Uses #11: `assertCoachOf`, `findActiveRelationship`, the roster and the
  seeded active relationship.
- Provides the goal summary chip consumed by `/coach/roster`.
