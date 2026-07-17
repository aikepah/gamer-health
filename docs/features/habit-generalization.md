# Feature: Habit System Generalization (#8)

**MVP 2, wave 1 — sequential within the habit domain: nothing habit-related
builds in parallel with this. #7 depends on it.** Issue:
[#8](https://github.com/aikepah/gamer-health/issues/8). Depends on #4.
Supersedes the "Habit catalog (fixed)" section of
`docs/features/habit-engine.md` (the prompt-generation model there still
stands).

## Goal

Replace the closed `habit_kind` enum with the `habit_definition` catalog so
habits can be arbitrary and out-of-game (nutrition, workouts, …): built-in
defaults, admin-added defaults (#7), and later coach-created custom
definitions (#14). Per-user `habit` rows reference definitions; the
generation-on-read prompt engine contract is preserved.

## Fixed decisions

- **Three definition origins, one shape** (see `habit_definition` in
  `packages/db/src/schema.ts`): built-in (`slug` set, `createdByUserId`
  null, `isDefault` true), admin default (slug null, createdBy admin,
  isDefault true), coach custom (slug null, createdBy coach, isDefault
  false — wave 2, out of scope here).
- **Player-visible catalog** = definitions with `isDefault && archivedAt IS
  NULL`, **plus** any definition the user already has an instance of
  (archived or not). Archived definitions can't gain new instances, but
  existing instances keep working until the user disables them.
- **`bedtime_cutoff` is now its own trigger type** (enum value already
  added). The engine switches on `triggerType` alone — no slug/kind special
  cases. Required config keys per trigger:
  `session_interval` → `intervalMinutes`; `daily_schedule` → `timeOfDay`;
  `bedtime_cutoff` → `bedtime` + `leadMinutes`.
- **Catalog source of truth moves to `@gamer-health/validators`** as
  `BUILT_IN_HABIT_DEFINITIONS` (slug, title, description, promptText,
  triggerType, defaultConfig — same data as the table in
  `packages/db/src/migrations/0001-habit-definition-backfill.ts`). Seed and
  the migration script import it (refactor the script's inline copy to the
  import once validators has it); `packages/core/src/habits/definitions.ts`
  is deleted. At runtime, core reads definitions from the DB, never the
  constant.
- **Gamification contract unchanged**: reward-event `meta.habitKind` keeps
  its name and now carries `definition.slug ?? null` (plus a new
  `meta.definitionId`). Streak logic keys off the same slug values as
  before, so `packages/core/src/gamification` needs no changes; custom
  habits earn XP but no per-habit streak (fine).
- `habit.assignedByUserId` exists in schema for #14 but stays null and
  unrendered in this feature.
- Habit instances are never deleted in MVP — `enabled: false` is the off
  switch (matches current behavior; keeps prompt history intact).

## Migration (the centerpiece — follow exactly, in one PR)

Current state (already landed by the architect, verified against local
data): `habit_definition` table exists; `habit.definition_id` and
`habit.assigned_by_user_id` exist as **nullable** transitional columns
alongside the legacy `kind`/`trigger_type`; the idempotent backfill script
`packages/db/src/migrations/0001-habit-definition-backfill.ts` inserts the
six built-ins (upsert by slug) and links `definition_id` from `kind`.

Builder steps, in order:

1. Implement the code changes below (core, api, web, validators, seed) —
   with `kind`/`triggerType` gone from all app code.
2. **Update `seed.ts`**: add a `seedHabitDefinitions()` section (upsert
   built-ins by slug from `BUILT_IN_HABIT_DEFINITIONS`; runs before the
   habit section) and change `seedHabitEngine` to look definitions up by
   slug and insert `definitionId` (no `kind`/`triggerType` fields).
3. **Run the backfill** against your local DB:
   `pnpm -F @gamer-health/db with-env tsx src/migrations/0001-habit-definition-backfill.ts`
   — it must print `0 still NULL` (it throws otherwise; do not proceed on
   failure). Re-run it if you re-seed before step 5 (re-seeding during the
   window recreates NULL `definition_id` rows).
4. **Apply the final schema** in `packages/db/src/schema.ts`:
   - delete `habitKindEnum`;
   - in `Habit`: delete the `kind` and `triggerType` columns, the
     TRANSITIONAL doc comments, and the `habit_user_kind_idx` unique index;
     change `definitionId` to
     `t.uuid().notNull().references(() => HabitDefinition.id)` (keep the
     no-cascade comment);
   - replace `UpsertHabitSchema` (see core section — the input schema moves
     to core; delete the drizzle-zod one and its TRANSITIONAL comment).
5. `pnpm -F @gamer-health/db push` — **DESTRUCTIVE, review before
   approving**. Expected statements: `ALTER TABLE habit ALTER COLUMN
   definition_id SET NOT NULL`; `DROP COLUMN kind`; `DROP COLUMN
   trigger_type`; drop of index `habit_user_kind_idx`; `DROP TYPE
   habit_kind`. If SET NOT NULL fails, you skipped step 3 — run it and push
   again. Anything else unexpected: stop and escalate.
6. `pnpm db:seed`, then verify the real flows (see acceptance criteria).

Fresh databases (CI, new machines) never run the script: push creates the
final shape directly and seed populates definitions. The script remains in
the repo for anyone holding a pre-#8 local DB; it references `habit.kind`
only inside raw SQL, so it typechecks after the column drop (and simply
fails at runtime on post-#8 DBs — note in its header already says so).

## Acceptance criteria

1. `/habits` renders the catalog from the DB: all default definitions plus
   the user's instances, enable switches and config inputs driven by
   `triggerType` (interval minutes / time of day / bedtime + lead), saving
   per card. An archived definition the user has adopted still renders
   (with an "archived" badge) and can be disabled but a non-adopted archived
   definition is absent.
2. Prompt engine behavior is unchanged for the six built-ins (same due
   times, expiry rules, dedupe) — existing `syncHabitPrompts` unit tests
   pass after mechanical updates (definition join instead of kind lookup).
3. A `daily_schedule` definition created by an admin (#7 UI, or SQL/seed for
   this PR's verification) can be enabled by a player and generates prompts
   at its `timeOfDay` like `daily_movement` always did — proving out-of-game
   habits work with zero engine changes.
4. Completing a prompt still awards XP; hydration streaks still increment
   (slug contract intact).
5. Existing local data survives: after the migration steps, previously
   enabled habits are still enabled with their configs, and habit-prompt
   history is intact (`habit_prompt` untouched throughout).
6. `pnpm typecheck && pnpm lint && pnpm test` green; push is a no-op on a
   second run.

## Core service changes (`packages/core/src/habits/`)

```ts
// validateHabitConfig.ts (NEW — exported; #7 reuses it)
export function validateHabitConfig(
  triggerType: "session_interval" | "daily_schedule" | "bedtime_cutoff",
  config: HabitConfig,
): void; // CoreError("BAD_REQUEST") naming the missing key(s)

// listHabits.ts — same name, new shape (catalog ∪ instances, per decisions)
export async function listHabits(ctx): Promise<{
  definitionId: string;
  slug: string | null;
  title: string; description: string; promptText: string;
  triggerType: "session_interval" | "daily_schedule" | "bedtime_cutoff";
  archived: boolean;
  enabled: boolean;              // false when no instance exists
  config: HabitConfig;           // instance config, else defaultConfig
  habitId: string | null;
  assignedByUserId: string | null;  // always null until #14
}[]>;
// Order: enabled instances first, then remaining catalog by title.

// upsertHabit.ts — input moves here (delete UpsertHabitSchema from db)
export const upsertHabitInput = z.object({
  definitionId: z.uuid(),
  enabled: z.boolean(),
  config: HabitConfigSchema.optional(),
});
export async function upsertHabit(ctx, input): Promise<HabitRow>;
// Definition must exist and be visible to the caller (isDefault, or caller
// already has an instance) else NOT_FOUND. Archived + no existing instance →
// BAD_REQUEST("This habit is no longer available"). config =
// { ...definition.defaultConfig, ...input.config } then
// validateHabitConfig(definition.triggerType, config). Upsert on the
// (userId, definitionId) unique index.

// syncHabitPrompts.ts — same algorithm as docs/features/habit-engine.md,
// re-keyed: load enabled habits WITH their definition; switch on
// definition.triggerType:
//   session_interval → unchanged (config.intervalMinutes)
//   daily_schedule   → the old daily_movement path (config.timeOfDay;
//                      expires end of its local day)
//   bedtime_cutoff   → the old bedtime path (dueAt = bedtime − leadMinutes,
//                      generated only while a session is active; expires
//                      past bedtime)
// Return shape: pending prompts decorated with title/promptText from the
// JOINED DEFINITION ROW (no constants file).

// respondToPrompt.ts — unchanged except the reward event meta:
//   meta: { habitKind: definition.slug ?? null, definitionId }
```

Delete `packages/core/src/habits/definitions.ts` (`HABIT_DEFINITIONS`,
`HABIT_KINDS`, `habitKindSchema`, `HabitKind`); fix all imports. The
`HabitKind` type disappears — where tests/UI referenced it, use the trigger
union or the definition row type.

## tRPC routes

`habit` router keys unchanged (`list`, `upsert`, `pendingPrompts`,
`respondPrompt`); only `upsert`'s input schema changes (breaking client
change contained in this same PR).

## UI surfaces

- `/habits`: same card-per-habit page, now driven by `habit.list`'s new
  shape — title/description from the definition, config inputs chosen by
  `triggerType` (see AC 1), archived badge where applicable. No
  hardcoded habit list anywhere in the app afterward (grep for the old kind
  strings to confirm).
- Prompt tray + notifications: unchanged (promptText now flows from the
  definition through `pendingPrompts`).

## Seed additions

- `seedHabitDefinitions()` (before the habit section): upsert the six
  built-ins by slug from `BUILT_IN_HABIT_DEFINITIONS`.
- `seedHabitEngine`: unchanged demo data, but rows carry `definitionId`
  (lookup by slug) instead of `kind`/`triggerType`.
- (The admin-created "Eat a real meal" definition is #7's seed, not this
  one.)

## Non-goals

- No coach-created definitions or assignment (#14 — schema is ready, code
  is not built here), no player-authored definitions, no instance deletion,
  no per-definition XP amounts, no prompt backfill, no definition
  versioning (config/definition edits affect future prompts only), no
  changes to gamification code.

## Dependencies / provides

- Uses #4 (`requireActiveUser` via protectedProcedure; no role checks —
  this is a player feature). Blocks #7 (definition management) and wave-2
  #12/#14.
- Provides: `validateHabitConfig` (used by #7),
  `BUILT_IN_HABIT_DEFINITIONS` in validators, the definition-driven prompt
  engine wave 2 assigns habits through.
