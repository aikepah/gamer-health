# Feature: Habit Engine

**Phase 2 — parallel-safe.** Depends on auth-profile (shared infra, profile timezone). Reads `GameSession` via the schema only (no code dependency on the session-tracking feature).

## Goal

Users toggle/configure built-in habits; the app generates habit prompts tied to the active gaming session (interval habits) and to the daily schedule, shows them in-app with browser notifications, and users mark them done/skipped. Done prompts emit `habit_prompt_completed` reward events.

## Prompt generation model (fixed decision — no background jobs in MVP)

**Generation-on-read.** There is no job runner: prompts are materialized by `syncHabitPrompts`, a core function invoked by the `habit.pendingPrompts` tRPC query, which the client polls (60 s interval) whenever the app shell is mounted. Due times are **deterministic** (computed from session start / local schedule), and the unique index `(habitId, dueAt)` on `habit_prompt` makes generation idempotent — concurrent polls and repeated calls insert nothing twice. Consequences to embrace, not fix: prompts appear only while a client is polling; a user who closes the tab gets no notifications (browser Notification API only, PWA/push is post-MVP); missed daily prompts are not backfilled for past days.

## Habit catalog (fixed)

`packages/core/src/habits/definitions.ts`:

```ts
export const HABIT_DEFINITIONS: Record<HabitKind, {
  title: string;
  description: string;
  promptText: string;            // shown on generated prompts
  triggerType: "session_interval" | "daily_schedule";
  defaultConfig: HabitConfig;    // HabitConfig from @gamer-health/db/schema
}>;
```

| kind | triggerType | defaultConfig | promptText (gist) |
|---|---|---|---|
| `break_interval` | session_interval | `{ intervalMinutes: 50 }` | Take a 5-minute break |
| `hydrate` | session_interval | `{ intervalMinutes: 30 }` | Drink some water |
| `stretch` | session_interval | `{ intervalMinutes: 60 }` | Stand up and stretch |
| `posture` | session_interval | `{ intervalMinutes: 45 }` | Posture check |
| `bedtime_cutoff` | daily_schedule | `{ bedtime: "23:00", leadMinutes: 60 }` | Start winding down — bedtime soon |
| `daily_movement` | daily_schedule | `{ timeOfDay: "17:00" }` | Get 20 minutes of movement |

`HabitKind` = the `habit_kind` pg enum values; export the TS union from the definitions file (or reuse `Habit.kind`'s inferred type).

## Timezone helper (create here; gamification and dashboard reuse it)

`packages/core/src/lib/dates.ts`, using **`@date-fns/tz`** (add to `packages/core` dependencies — do not hand-roll offset math):

```ts
export function localDateString(instant: Date, timeZone: string): string; // "YYYY-MM-DD" wall date
export function zonedTimeToUtc(dateStr: string, time: string, timeZone: string): Date;
// UTC instant of wall time `time` ("HH:MM") on `dateStr` in `timeZone` (TZDate)
export function addMinutes(d: Date, minutes: number): Date;
```

Unit-test `localDateString`/`zonedTimeToUtc` across a DST boundary and UTC.

## Core services (`packages/core/src/habits/`)

All require `requireUserId`; rows scoped by userId; foreign rows → `CoreError("NOT_FOUND")`.

```ts
// listHabits.ts — no input. Merge catalog + user rows:
export async function listHabits(ctx): Promise<{
  kind: HabitKind; title: string; description: string;
  triggerType: "session_interval" | "daily_schedule";
  enabled: boolean;            // false when no row exists
  config: HabitConfig;         // row config, else defaultConfig
  habitId: string | null;
}[]>;

// upsertHabit.ts
export const upsertHabitInput = z.object({
  kind: /* enum of habit kinds */,
  enabled: z.boolean(),
  config: HabitConfigSchema.optional(), // from @gamer-health/db/schema
});
export async function upsertHabit(ctx, input): Promise<Habit>;
// triggerType always from HABIT_DEFINITIONS (never client-supplied).
// config = { ...defaultConfig, ...input.config }, then validate per kind:
//   session_interval kinds require intervalMinutes; bedtime_cutoff requires
//   bedtime + leadMinutes; daily_movement requires timeOfDay — else BAD_REQUEST.
// Upsert on the (userId, kind) unique index.

// syncHabitPrompts.ts — the generation-on-read engine
export const syncHabitPromptsInput = z.object({ now: z.date().optional() }); // now: injectable for tests only
export async function syncHabitPrompts(ctx, input): Promise<{
  pending: (HabitPrompt & { habit: Habit; promptText: string; title: string })[];
}>;

// respondToPrompt.ts
export const respondToPromptInput = z.object({
  promptId: z.uuid(),
  response: z.enum(["done", "skipped"]),
});
export async function respondToPrompt(ctx, input): Promise<HabitPrompt>;
// Only from status "pending" (else CONFLICT). Sets status + respondedAt = now.
// If done: recordRewardEvent(ctx, { eventType: "habit_prompt_completed",
//   sourceId: prompt.id, meta: { habitKind: habit.kind } })
```

### `syncHabitPrompts` algorithm (deterministic; follow exactly)

Let `now` = input.now ?? new Date(); `tz` = `getOrCreateProfile(ctx).timezone ?? "UTC"` (timezone is null until the user saves one); `today` = `localDateString(now, tz)`. Load the user's enabled habits.

1. **Session-interval generation.** Find the user's active session (`endedAt IS NULL`). If present, for each enabled `session_interval` habit with `intervalMinutes = m`: candidate due times `startedAt + k*m minutes` for `k = 1, 2, …` while `dueAt <= now` (cap `k` at 500 as a sanity bound). Insert `{ habitId, userId, sessionId, dueAt }` with `onConflictDoNothing` (dedupe index `habitId + dueAt`). No prompts are generated for ended or retro-logged sessions.
2. **Daily generation** (for `today` only — never backfill):
   - `daily_movement`: `dueAt = zonedTimeToUtc(today, config.timeOfDay, tz)`; insert (sessionId null) when `dueAt <= now`.
   - `bedtime_cutoff`: `dueAt = zonedTimeToUtc(today, config.bedtime, tz) − leadMinutes`; insert only when `dueAt <= now` **and** the user has an active session (the point is "you're still gaming near bedtime"; no nag otherwise).
3. **Expiry.** Update the user's `pending` prompts to `expired` where any of:
   - session-interval prompt whose session has ended (`endedAt IS NOT NULL`);
   - `bedtime_cutoff` prompt with `now > dueAt + leadMinutes` (i.e. past bedtime);
   - `daily_movement` prompt with `localDateString(dueAt, tz) < today` (end of its local day);
   - any other pending prompt with `now > dueAt + 60 minutes`.
4. Return remaining `pending` prompts with `dueAt <= now`, joined with their habit, decorated with `title`/`promptText` from `HABIT_DEFINITIONS`, ordered by `dueAt` asc.

**Reward events:** create the two canonical shared files from `docs/features/gamification.md` §"Shared contract" if absent. Always pass `meta.habitKind` so Phase 3 streaks work without call-site changes.

## tRPC routes (`packages/api/src/router/habit.ts`, mounted `habit`)

- `list`: protected query → `listHabits`
- `upsert`: protected mutation, input `upsertHabitInput` → `upsertHabit`
- `pendingPrompts`: protected query → `syncHabitPrompts` (yes, the query has write side effects by design — document with a comment)
- `respondPrompt`: protected mutation, input `respondToPromptInput` → `respondToPrompt`

## UI surfaces

- **`/habits` page**: one card per catalog habit (title, description, enable switch, config inputs — number input for interval minutes, time inputs for bedtime/timeOfDay, number for lead minutes). Saves via `habit.upsert` per card.
- **Prompt tray** (`app/_components/habits/prompt-tray.tsx`, client component mounted in the signed-in app layout/home): polls `habit.pendingPrompts` with `refetchInterval: 60_000`; renders pending prompts as a stack of dismissible cards (promptText, due time, Done / Skip buttons → `habit.respondPrompt`, invalidate on success).
- **Browser notifications**: on mount request `Notification.permission` (only after the user enables ≥1 habit — no permission prompt on first load of the app for anonymous/new users); when a poll returns a prompt id not seen before in this tab (keep a `useRef<Set>`), fire `new Notification(title, { body: promptText })` if permission granted. No service worker.

## Seed additions (`packages/db/src/seed.ts` — habit-engine section)

For the demo user (delete-then-insert their `habit` + `habit_prompt` rows):

- Habits: `break_interval`, `hydrate`, `daily_movement`, `bedtime_cutoff` enabled with default configs; `stretch`, `posture` absent (UI shows them as available-but-disabled).
- Prompts: for 2–3 of the seeded past sessions, generate what the engine would have: e.g. per session one `break_interval` and two `hydrate` prompts at correct offsets with mixed statuses (`done` with respondedAt, `skipped`, `expired`); plus 3 past `daily_movement` prompts on distinct days (2 done, 1 expired, sessionId null). Statuses feed the dashboard completion-rate chart and the gamification seed (which rewards `done` prompts).

## Non-goals

- No push/PWA notifications, no backfill of missed daily prompts, no custom user-defined habits, no per-habit custom XP, no snooze, no prompt generation for retro-logged/ended sessions, no cron/job runner.

## Dependencies / emits

- Uses: `requireUserId`, `CoreError`, `toServiceCtx`, `getOrCreateProfile` (timezone); reads `GameSession` table directly.
- Emits: `habit_prompt_completed` (sourceKind `habit_prompt`, sourceId = prompt id, +15 XP, `meta.habitKind`).
- Provides: `packages/core/src/lib/dates.ts` (used by gamification + dashboard); prompt status data for the dashboard's habit-completion chart.
