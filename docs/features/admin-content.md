# Feature: Admin Content Management (#7)

**MVP 2, wave 1 — builds LAST in the wave: after #4 and #8 (habit
definitions must exist to manage), and after #5 (audit helper, seeded
players).** Issue: [#7](https://github.com/aikepah/gamer-health/issues/7).

## Goal

An `/admin/content` console for shared content: games-catalog CRUD
(rename / merge / delete the free-text-created mess) and management of the
default habit-definition set offered to players.

## Fixed decisions

- **Game merge semantics**: `mergeGames(source, target)` repoints
  `game_session.gameId` from source to target in a transaction, then deletes
  the source row. `steamAppId`: if source has one and target doesn't, move it
  to target; if **both** have one and they differ, CONFLICT before any write
  (Steam identity is ambiguous — resolve manually). Wave-2 note: #9 adds a
  `coach_game` (games-coached) table; when it exists, merge must also
  repoint it — #9's spec carries the reminder, but leave a comment at the
  repoint site.
- **Game delete** is allowed only when zero `game_session` rows reference it
  (else CONFLICT suggesting merge). The FK already blocks it at DB level;
  check first for a friendly error.
- **Habit definitions**: `triggerType` and `slug` are immutable after
  creation (config validation and prompt semantics hang off the trigger;
  slugs are code-facing keys). Built-ins (`slug != null`) can be edited
  (title/description/promptText/defaultConfig) but never deleted — archive
  instead. Any definition with existing habit instances can only be
  archived, not deleted.
- **Archiving** removes a definition from the player adopt list only;
  existing user habits keep generating prompts until the user disables them
  (rule fixed in `docs/features/habit-generalization.md`).
- Admin-created definitions get `slug: null`, `isDefault: true`,
  `createdByUserId: <actor>`.
- Destructive/curatorial actions write `admin_audit_log` rows via
  `recordAdminAudit` (#5): `game_rename`, `game_merge`, `game_delete`,
  `habit_def_create`, `habit_def_update`, `habit_def_archive`,
  `habit_def_unarchive`, `habit_def_delete`.

## Acceptance criteria

1. `/admin/content` has two tabs: **Games** and **Default habits**.
2. Games tab: searchable table (name, platform, steamAppId, session count,
   created); rename dialog (name/platform) with a CONFLICT error when the
   new name collides case-insensitively ("merge instead"); merge dialog
   (searchable target picker, shows what will move, confirm) that repoints
   sessions and removes the source; delete with confirm, disabled (tooltip)
   when session count > 0.
3. After a merge, the source game's sessions appear under the target
   everywhere (session list, dashboard), and the source is gone from the
   catalog/autocomplete.
4. Default habits tab: table of all definitions incl. archived (badge),
   showing trigger type, default config summary, instance count, origin
   (built-in / admin); create dialog whose config fields follow the selected
   trigger type; edit dialog with trigger locked; archive/unarchive; delete
   only enabled for non-built-in definitions with zero instances.
5. A newly created default definition appears in the player `/habits`
   catalog; an archived one disappears from it (existing instances
   unaffected).
6. All actions in AC 2–4 write the audit rows listed above (visible on
   `/admin/users`' activity panel).

## Core services (`packages/core/src/admin/content/`)

Games:

```ts
// listGamesAdmin.ts
export const listGamesAdminInput = z.object({
  query: z.string().trim().max(255).optional(),   // ILIKE on name
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
export async function listGamesAdmin(ctx, input): Promise<{
  total: number;
  games: { id: string; name: string; platform: string | null;
           steamAppId: number | null; createdAt: Date;
           sessionCount: number }[];
}>;

// renameGame.ts
export const renameGameInput = z.object({
  gameId: z.uuid(),
  name: z.string().trim().min(1).max(256),
  platform: z.string().trim().min(1).max(64).nullish(),
});
export async function renameGame(ctx, input): Promise<GameRow>;
// NOT_FOUND; unique lower(name) violation → CONFLICT("A game with this name
// already exists — merge instead"). Audit game_rename meta { from, to }.

// mergeGames.ts
export const mergeGamesInput = z.object({
  sourceGameId: z.uuid(),
  targetGameId: z.uuid(),
});
export async function mergeGames(ctx, input): Promise<{ movedSessions: number }>;
// source !== target (BAD_REQUEST); both exist (NOT_FOUND); steamAppId rule
// per decisions. Transaction: UPDATE game_session; move steamAppId if
// applicable; DELETE source; audit game_merge meta { sourceName, targetName,
// movedSessions }.

// deleteGame.ts
export const deleteGameInput = z.object({ gameId: z.uuid() });
export async function deleteGame(ctx, input): Promise<void>;
// NOT_FOUND; sessionCount > 0 → CONFLICT("This game has logged sessions —
// merge it into another game instead"). Audit game_delete meta { name }.
```

Habit definitions (all call `requireRole(ctx, ["admin"])`; config validated
with `validateHabitConfig` from #8):

```ts
// listHabitDefinitionsAdmin.ts — no input
export async function listHabitDefinitionsAdmin(ctx): Promise<
  (HabitDefinitionRow & { instanceCount: number })[]
>;
// All definitions, archived included, ordered: active first, then title.

// createHabitDefinition.ts
export const createHabitDefinitionInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1000),
  promptText: z.string().trim().min(1).max(200),
  triggerType: z.enum(["session_interval", "daily_schedule", "bedtime_cutoff"]),
  defaultConfig: HabitConfigSchema,
});
export async function createHabitDefinition(ctx, input): Promise<HabitDefinitionRow>;
// validateHabitConfig(triggerType, defaultConfig); insert with slug null,
// isDefault true, createdByUserId actor. Audit habit_def_create.

// updateHabitDefinition.ts
export const updateHabitDefinitionInput = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(1000).optional(),
  promptText: z.string().trim().min(1).max(200).optional(),
  defaultConfig: HabitConfigSchema.optional(),
});
export async function updateHabitDefinition(ctx, input): Promise<HabitDefinitionRow>;
// NOT_FOUND; defaultConfig (when given) validated against the row's
// triggerType. Audit habit_def_update meta { fields: [...] }.

// setHabitDefinitionArchived.ts
export const setHabitDefinitionArchivedInput = z.object({
  id: z.uuid(),
  archived: z.boolean(),
});
export async function setHabitDefinitionArchived(ctx, input): Promise<HabitDefinitionRow>;
// NOT_FOUND; no-op if already in state (return unchanged, no audit).
// Audit habit_def_archive / habit_def_unarchive.

// deleteHabitDefinition.ts
export const deleteHabitDefinitionInput = z.object({ id: z.uuid() });
export async function deleteHabitDefinition(ctx, input): Promise<void>;
// NOT_FOUND; slug != null (built-in) → CONFLICT("Built-in definitions can't
// be deleted — archive instead"); instanceCount > 0 → CONFLICT("In use —
// archive instead"). Audit habit_def_delete meta { title }.
```

## tRPC routes (`packages/api/src/router/admin/content.ts`, key `content` in the admin router)

All `adminProcedure` one-liners: `listGames`, `renameGame`, `mergeGames`,
`deleteGame` (queries/mutations as appropriate), `listHabitDefinitions`,
`createHabitDefinition`, `updateHabitDefinition`,
`setHabitDefinitionArchived`, `deleteHabitDefinition`.

## UI surfaces

- `/admin/content` with shadcn `Tabs`. Games tab and Default habits tab per
  AC 2–4. Config fields by trigger type (reuse the pattern from `/habits`):
  `session_interval` → interval minutes number input; `daily_schedule` →
  time input; `bedtime_cutoff` → bedtime time input + lead minutes number
  input. Toasts + list invalidation on every mutation; CONFLICT messages
  surfaced verbatim.

## Seed additions

- Games: two curation-demo entries — `"Rocket Leage"` (typo dupe of Rocket
  League) with **one** completed retro session belonging to `player1` (from
  #5's seed; keeps the demo user's dashboard untouched), and
  `"elden ring (steam)"` with zero sessions (delete-demo). Insert
  `onConflictDoNothing` by name like the existing catalog.
- Habit definitions: one admin-created default — title "Eat a real meal",
  description "Step away and eat something that isn't a snack.", promptText
  "Time for a real meal", triggerType `daily_schedule`, defaultConfig
  `{ timeOfDay: "12:30" }`, `createdByUserId` = demo admin, upserted by
  title within the seed section (delete-then-insert where `slug IS NULL`).

## Non-goals

- No game creation UI for admins (players create via free text; admins
  curate), no bulk merge, no Steam metadata lookup, no habit-definition
  versioning (edits affect future prompts only), no coach-created
  definitions (#14), no undo.

## Dependencies / provides

- Uses #4 (`adminProcedure`, `requireRole`, admin router skeleton), #5
  (`recordAdminAudit`, seeded players), #8 (`HabitDefinition` semantics,
  `validateHabitConfig`, player catalog behavior).
- Provides: curated catalogs consumed by wave 2 (#9 games-coached picker
  reads the games catalog; #14 builds on definition CRUD patterns).
