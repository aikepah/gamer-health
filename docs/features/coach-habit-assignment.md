# Feature: Coach Habit Assignment (#14)

**MVP 2, wave 2 — parallel-safe with #12/#13/#15 once #11 lands.**
Issue: [#14](https://github.com/aikepah/gamer-health/issues/14).
Depends on #11 and #8.

## Goal

Coaches author custom habit definitions (including out-of-game ones —
nutrition, workouts) and assign habits to roster players. Assigned habits flow
through the existing prompt engine unchanged and are badged as coach-assigned
in the player's habit UI.

## Schema verification (architect) — NO new habit tables

#8 anticipated this feature and the columns are already live on `main`:

| Need | Existing column |
|---|---|
| Coach-authored definition | `habit_definition.isDefault = false` + `createdByUserId = coach` |
| Not offered in the public catalog | `listHabits` only returns `isDefault && !archivedAt` (plus owned instances) — a coach definition is therefore invisible until assigned |
| Assignment provenance | `habit.assignedByUserId` |
| One instance per definition per user | `habit_user_definition_idx` |
| Retiring a coach definition | `habit_definition.archivedAt` |

**The only schema addition wave 2 made for #14 is one index** —
`habit_definition_created_by_idx` on `created_by_user_id`, so a coach can list
their own definitions. It is already pushed. Do not add tables or columns.

Note also that `upsertHabit` already rejects self-adoption of another coach's
definition: `if (!definition.isDefault && !existing) → NOT_FOUND`. That guard
is load-bearing for this feature — don't "fix" it.

## Fixed decisions (architect — do not revisit)

- **The player-can't-delete rule (the issue asked for a decision).** There is
  no habit-delete service today and this feature does not add one. Concretely:
  - The player MAY disable (`enabled = false`) and MAY tune `config`
    (interval, time of day) on a coach-assigned habit — personalization is
    harmless and forcing a schedule on someone is exactly the wrong product.
  - The player MAY NOT remove the habit instance. The UI shows
    "Assigned by <coach>" with a "Pause" control instead of any removal
    affordance.
  - The coach sees `enabled: false` in their assigned-habit list, so a paused
    habit is a conversation, not a silent failure.
- **Unassign never deletes player data.** `unassignHabitFromPlayer` sets
  `assignedByUserId = null`, and additionally `enabled = false` when the
  definition is coach-custom (`isDefault = false`) — otherwise a definition
  the player can no longer see would keep generating prompts. A previously
  self-adopted default habit just reverts to self-adopted and keeps running.
  This sidesteps ownership disputes and never destroys history
  (`habit_prompt` rows and their reward events stay intact).
- **Assignment is an upsert on `(userId, definitionId)`.** If the player
  already has an instance, assignment sets `enabled = true`, applies the
  coach's config, and stamps `assignedByUserId` (even if it was previously
  self-adopted). Assigning is an explicit act by someone the player chose.
- **Coach definitions never become defaults.** `createCoachHabitDefinition`
  hard-codes `isDefault = false`; only admins (#7) create defaults. A coach
  can only assign definitions that are (a) `isDefault && !archivedAt` or
  (b) authored by that coach.
- **Assignments survive the relationship ending** — the habit keeps working
  and keeps its `assignedByUserId`. The ex-coach simply loses visibility via
  `assertCoachOf`. No cleanup, consistent with goals (#13).
- **Gamification is untouched.** Assigned habits emit the same
  `habit_prompt_completed` events through the existing engine. Do not
  hand-award anything, and do not add a coach-specific streak kind.

## Acceptance criteria

1. `/coach/habits` lets a coach create, edit and archive their own habit
   definitions (title, description, prompt text, trigger type — immutable
   after creation — and default config), reusing #7's admin habit-definition
   form components where practical.
2. A Habits panel on `/coach/players/[playerUserId]` lists that player's
   habits with source (self-adopted vs assigned-by-me), enabled state, and a
   7-day completion rate; an "Assign habit" dialog picks from the default
   catalog plus the coach's own definitions and optionally overrides config.
3. Assigning creates/updates the `habit` row; the player's `/habits` page
   immediately shows it enabled with an "Assigned by <coach name>" badge and
   no delete control, and its prompts start generating on the next
   `syncHabitPrompts` call (verify with a real session).
4. The player can pause and reconfigure an assigned habit; the coach's panel
   reflects the paused state.
5. Unassigning behaves exactly as specified above (verify both the
   coach-custom and the default-definition case).
6. A coach cannot assign to a non-roster player (FORBIDDEN), cannot assign
   another coach's definition (NOT_FOUND), and cannot archive a definition
   they don't own (FORBIDDEN).

## Core services (`packages/core/src/coaching/habits/`)

```ts
// createCoachHabitDefinition.ts
export const createCoachHabitDefinitionInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  promptText: z.string().trim().min(1).max(200),
  triggerType: z.enum(HABIT_TRIGGER_TYPES),
  defaultConfig: HabitConfigSchema.default({}),
});
export async function createCoachHabitDefinition(ctx, input): Promise<HabitDefinitionRow>;
// requireRole coach; validateHabitConfig(triggerType, defaultConfig);
// insert with slug: null, isDefault: false, createdByUserId: caller.
// Cap 50 definitions per coach → CONFLICT.

// updateCoachHabitDefinition.ts — same fields minus triggerType (immutable);
// ownership check: definition.createdByUserId === caller && !isDefault, else
// FORBIDDEN. setCoachHabitDefinitionArchived.ts — { definitionId, archived },
// same ownership check; archiving does NOT touch existing habit instances.

// listCoachHabitDefinitions.ts
export async function listCoachHabitDefinitions(ctx): Promise<
  (HabitDefinitionRow & { assignedCount: number })[]
>;
// requireRole coach; createdByUserId = caller; assignedCount = grouped count
// of `habit` rows per definition (one grouped query, not N+1).

// listAssignableHabitDefinitions.ts
export async function listAssignableHabitDefinitions(ctx): Promise<HabitDefinitionRow[]>;
// requireRole coach; (isDefault AND archivedAt IS NULL) OR createdByUserId = caller.
// This is the exact set assignHabitToPlayer accepts — keep them in one helper
// so the UI can't offer something the service rejects.

// assignHabitToPlayer.ts
export const assignHabitToPlayerInput = z.object({
  playerUserId: z.string().min(1),
  definitionId: z.uuid(),
  config: HabitConfigSchema.optional(),
});
export async function assignHabitToPlayer(ctx, input): Promise<HabitRow>;
// 1. assertCoachOf(ctx, input.playerUserId)
// 2. definition must be in the assignable set (else NOT_FOUND)
// 3. config = { ...definition.defaultConfig, ...input.config };
//    validateHabitConfig(definition.triggerType, config)
// 4. insert habit { userId: playerUserId, definitionId, enabled: true,
//    config, assignedByUserId: caller } .onConflictDoUpdate on the
//    (userId, definitionId) index, setting enabled/config/assignedByUserId.

// unassignHabitFromPlayer.ts
export const unassignHabitFromPlayerInput = z.object({ habitId: z.uuid() });
export async function unassignHabitFromPlayer(ctx, input): Promise<void>;
// Load habit (NOT_FOUND); assertCoachOf(ctx, habit.userId);
// habit.assignedByUserId must equal caller (else CONFLICT
// "This habit wasn't assigned by you"). Set assignedByUserId = null, and
// enabled = false when the definition has isDefault = false. NEVER delete.

// listPlayerHabitsForCoach.ts
export const listPlayerHabitsForCoachInput = z.object({
  playerUserId: z.string().min(1),
  days: z.number().int().min(1).max(90).default(7),
});
export interface CoachPlayerHabitRow {
  habitId: string; definitionId: string; title: string;
  triggerType: HabitTriggerType; config: HabitConfig; enabled: boolean;
  assignedByMe: boolean; assignedByUserId: string | null;
  done: number; total: number;              // last `days`, from habit_prompt
}
export async function listPlayerHabitsForCoach(ctx, input): Promise<CoachPlayerHabitRow[]>;
// assertCoachOf first; reuse queryHabitCompletionRaw (#12) or a single grouped
// prompt-count query — do not write a new aggregate if #12's already exists.
```

### Player-side change (small, in existing files)

`ListHabitsItem.assignedByUserId` already exists but is always null today.
Extend `listHabits` to resolve the assigner's name into a new
`assignedByName: string | null` field (one `inArray` lookup on `user`, not
per-row), and drop the now-stale "Always null until #14" comment.

## tRPC routes (`packages/api/src/router/coaching/assignedHabits.ts`, key `assignedHabits`)

`coachProcedure` one-liners: `listDefinitions`, `createDefinition`,
`updateDefinition`, `setDefinitionArchived`, `listAssignable`,
`listPlayerHabits`, `assign`, `unassign`. No new player-side routes — the
existing `habit.list` / `habit.upsert` cover the player experience.

## UI surfaces

- `apps/nextjs/src/app/coach/habits/page.tsx` — the coach's definition
  library: table with assigned-count, create/edit dialog (trigger type locked
  on edit), archive toggle.
- Habits panel on `/coach/players/[playerUserId]` — assign dialog
  (definition select grouped "Catalog" / "My habits", optional config
  override), per-row completion rate, Unassign action with confirm explaining
  it will pause a custom habit.
- Player `/habits` page: "Assigned by <name>" badge on coach-assigned rows;
  the row's control set becomes Pause/Resume + Configure (no removal
  affordance); a short helper line explaining the coach can see completion.
- "My habits" entry in the coach nav.

## Seed additions

- Two coach-authored definitions for the demo coach: "Protein with lunch"
  (`daily_schedule`, `timeOfDay: "12:30"`) and "Evening mobility"
  (`daily_schedule`, `timeOfDay: "20:00"`), both `isDefault: false`.
- Assign "Protein with lunch" to the demo player (enabled, `assignedByUserId`
  = demo coach) and assign the built-in `hydrate` definition too, so both the
  custom and default assignment paths render.
- Assign "Evening mobility" to the demo player but `enabled: false`, so the
  paused-assigned-habit state is reachable.
- Ensure `syncHabitPrompts` still produces prompts for the seeded assigned
  habits (verify by loading the player habits page).

## Non-goals

- No habit "programs"/bundles or multi-habit templates, no scheduling a habit
  to start/end on a date, no per-assignment notes or messages, no coach-side
  completion reminders/nudges, no sharing definitions between coaches, no
  player-initiated request for a habit, no changes to XP/streak rules, no
  bulk assign across the roster.

## Dependencies / provides

- Uses #8 (`habit_definition`, `habit.assignedByUserId`, `validateHabitConfig`,
  `syncHabitPrompts`) and #11 (`assertCoachOf`).
- Overlaps #12 on the completion aggregate — whichever lands first owns
  `queryHabitCompletionRaw`; the second reuses it. Note this in the PR.
