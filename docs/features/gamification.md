# Feature: Gamification (event → reward engine)

**Phase 3 — depends on:** session-tracking, habit-engine, checkins (they emit the events this engine consumes). Build after they merge.

## Goal

A generic event→reward engine: features record reward events; this engine is the only thing that turns them into XP, streaks, and achievements. `reward_event` is the ONLY source of truth for XP — levels are derived by formula, streak counters are a rebuildable projection, achievement unlocks are persisted facts.

## Architecture decisions (fixed — do not revisit)

1. **Achievement definitions are code constants, not DB rows.** Only unlocks are persisted (`UserAchievement`, composite PK `userId + achievementKey`). Rationale: MVP has 6 achievements; code-defined constants version with deploys, need no seed sync, and unlock criteria are code anyway. Tradeoff accepted: definitions aren't SQL-joinable (irrelevant at this scale).
2. **Streaks are stored counters** (`Streak`, composite PK `userId + kind`), updated transactionally by `recordRewardEvent` — the single writer. Rationale: deriving streaks on read requires scanning full event history with per-user timezone day-bucketing on every dashboard load. Ground truth is preserved: counters can be rebuilt from `reward_event` if they ever drift (post-MVP `rebuildStreaks` if needed — not in scope).
3. **Event taxonomy constants live in `@gamer-health/validators`** (`packages/validators/src/gamification.ts`) so `packages/db/src/seed.ts` can use them without a `db → core` dependency cycle. Engine logic (recordRewardEvent, streaks, achievements, level curve) lives in `packages/core/src/gamification/`.
4. **Idempotency at the DB level:** unique index `(userId, eventType, sourceKind, sourceId)` on `reward_event`; all inserts use `onConflictDoNothing`. Re-emitting an event is always safe.
5. **XP is never revoked.** Deleting a session/checkin does not claw back XP (MVP simplification, documented in those specs).

## Shared contract: canonical Phase 2 files

Phase 2 features call `recordRewardEvent` before this feature exists. Each Phase 2 builder MUST create the two files below with **exactly this content** if they don't exist in its worktree (identical add/add merges cleanly in git). This feature then extends `events.ts` (call sites never change).

### `packages/validators/src/gamification.ts` (canonical — copy verbatim)

```ts
import { z } from "zod/v4";

/** Reward event taxonomy — single source of truth for XP amounts. */
export const REWARD_EVENT_DEFS = {
  /** Emitted by session-tracking when a session gets an endedAt (stop or retro log). */
  session_logged: { xp: 10, sourceKind: "game_session" },
  /** Emitted by habit-engine when a prompt is marked done. */
  habit_prompt_completed: { xp: 15, sourceKind: "habit_prompt" },
  /** Emitted by checkins on every created check-in. */
  checkin_completed: { xp: 10, sourceKind: "checkin" },
  /** Emitted by the gamification engine itself; xp comes from ACHIEVEMENT_DEFS. */
  achievement_unlocked: { xp: 0, sourceKind: "achievement" },
} as const;

export type RewardEventType = keyof typeof REWARD_EVENT_DEFS;

export const rewardEventTypeSchema = z.enum(
  Object.keys(REWARD_EVENT_DEFS) as [RewardEventType, ...RewardEventType[]],
);

export const STREAK_KINDS = [
  "daily_checkin",
  "daily_habit",
  "habit_hydrate",
] as const;
export type StreakKind = (typeof STREAK_KINDS)[number];

/** Achievement metadata. Unlock criteria live in @gamer-health/core. */
export const ACHIEVEMENT_DEFS = {
  first_session: {
    title: "First Quest",
    description: "Log your first gaming session",
    xp: 25,
  },
  sessions_10: {
    title: "Dedicated Player",
    description: "Log 10 gaming sessions",
    xp: 50,
  },
  first_checkin: {
    title: "Self-Aware",
    description: "Complete your first check-in",
    xp: 25,
  },
  checkin_streak_7: {
    title: "Week of Wellness",
    description: "Check in 7 days in a row",
    xp: 100,
  },
  hydration_streak_7: {
    title: "Hydration Hero",
    description: "Complete the hydrate habit 7 days in a row",
    xp: 100,
  },
  habit_prompts_25: {
    title: "Habit Machine",
    description: "Complete 25 habit prompts",
    xp: 75,
  },
} as const;
export type AchievementKey = keyof typeof ACHIEVEMENT_DEFS;
```

Also add (identical single line) to `packages/validators/src/index.ts`:
`export * from "./gamification";`

### `packages/core/src/gamification/events.ts` (canonical Phase 2 minimal version — copy verbatim)

```ts
import { z } from "zod/v4";

import { RewardEvent } from "@gamer-health/db/schema";
import {
  REWARD_EVENT_DEFS,
  rewardEventTypeSchema,
} from "@gamer-health/validators";

import type { ServiceCtx } from "../ctx";
import { requireUserId } from "../lib/auth";

export const recordRewardEventInput = z.object({
  eventType: rewardEventTypeSchema,
  /** Id of the source entity (uuid) or achievement key. */
  sourceId: z.string().min(1),
  /** Only used for achievement_unlocked (xp comes from the achievement def). */
  xpOverride: z.number().int().positive().optional(),
  /** Extra context consumed by the Phase 3 engine (streaks). */
  meta: z.object({ habitKind: z.string().optional() }).optional(),
});
export type RecordRewardEventInput = z.infer<typeof recordRewardEventInput>;

/**
 * Records a reward event, idempotently (unique on user+type+source).
 * Phase 3 (gamification feature) extends this function with streak updates
 * and achievement evaluation — Phase 2 features must NOT add logic here.
 */
export async function recordRewardEvent(
  ctx: ServiceCtx,
  input: RecordRewardEventInput,
): Promise<{ recorded: boolean }> {
  const userId = requireUserId(ctx);
  const def = REWARD_EVENT_DEFS[input.eventType];
  const rows = await ctx.db
    .insert(RewardEvent)
    .values({
      userId,
      eventType: input.eventType,
      xp: input.xpOverride ?? def.xp,
      sourceKind: def.sourceKind,
      sourceId: input.sourceId,
    })
    .onConflictDoNothing()
    .returning({ id: RewardEvent.id });
  return { recorded: rows.length > 0 };
}
```

Also add (identical single line) to `packages/core/src/index.ts`:
`export * from "./gamification/events";`

(`requireUserId` comes from the auth-profile feature, which merges before Phase 2 starts.)

## Acceptance criteria

- Completing a habit prompt / check-in / session stop while signed in increases total XP by the taxonomy amounts, exactly once per source entity (retrying is a no-op).
- A check-in today after a check-in yesterday moves `daily_checkin` from N to N+1; a gap of ≥2 local days (profile timezone) resets current to 1; `longest` never decreases.
- Completing a hydrate prompt bumps both `daily_habit` and `habit_hydrate`.
- Reaching an achievement criterion inserts one `user_achievement` row and one `achievement_unlocked` reward event with the achievement's XP — once, ever.
- `gamification.summary` returns totalXp, level, progress-to-next-level, and all streaks; level matches the curve below.
- Unit tests (Vitest, `packages/core`) cover the level curve and the streak date logic (same day / consecutive / gap / first activity).

## Core services (`packages/core/src/gamification/`)

### `level.ts` — pure functions (the level curve)

```ts
export function xpForLevel(level: number): number; // 100 * (level - 1) ** 2
export function levelFromXp(totalXp: number): number; // floor(sqrt(max(totalXp,0) / 100)) + 1
export function levelProgress(totalXp: number): {
  level: number;
  totalXp: number;
  levelFloorXp: number; // xpForLevel(level)
  nextLevelXp: number; // xpForLevel(level + 1)
  progress: number; // 0..1 within current level
};
```

Level 1 at 0 XP, level 2 at 100, level 3 at 400, level 4 at 900, level 5 at 1600…

### `events.ts` — extend the canonical `recordRewardEvent`

Keep the exported signature and input schema identical. New behavior, all inside one `ctx.db.transaction`:

1. Insert the event (as today). If nothing inserted (duplicate) → return `{ recorded: false }`, no side effects.
2. **Streak updates** — map eventType → streak kinds:
   - `checkin_completed` → `daily_checkin`
   - `habit_prompt_completed` → `daily_habit`, plus `habit_hydrate` when `meta.habitKind === "hydrate"`
   - `session_logged`, `achievement_unlocked` → none
   For each kind, compute today's local date via profile timezone (`localDateString` from `packages/core/src/lib/dates.ts`, created by habit-engine; profile via `getOrCreateProfile`, default UTC) and upsert `Streak`: same date → no-op; yesterday → `current + 1`; otherwise → `current = 1`; `longest = max(longest, current)`; set `lastActivityDate`.
3. **Achievement evaluation** — candidates by trigger:
   - `session_logged` → `first_session` (≥1 completed session), `sessions_10` (≥10 completed sessions; completed = `endedAt` not null)
   - `checkin_completed` → `first_checkin` (≥1 checkin), `checkin_streak_7` (`daily_checkin.current ≥ 7`)
   - `habit_prompt_completed` → `habit_prompts_25` (≥25 prompts with status `done`), `hydration_streak_7` (`habit_hydrate.current ≥ 7`)
   For each satisfied candidate: insert `UserAchievement` with `onConflictDoNothing`; if actually inserted, insert an `achievement_unlocked` reward event directly (xp from `ACHIEVEMENT_DEFS`, sourceId = achievement key, `onConflictDoNothing`). Do NOT recurse — unlocks never trigger further evaluation.

### `queries.ts`

```ts
export const getGamificationSummaryInput = z.object({}); // no input
export async function getGamificationSummary(ctx): Promise<{
  totalXp: number; // SUM(reward_event.xp) for user, 0 if none
  level: number;
  levelFloorXp: number;
  nextLevelXp: number;
  progress: number;
  streaks: { kind: StreakKind; current: number; longest: number; lastActivityDate: string | null }[];
  // include all STREAK_KINDS, zeroed when no row exists
}>;

export async function listAchievements(ctx): Promise<
  { key: AchievementKey; title: string; description: string; xp: number; unlockedAt: Date | null }[]
>; // all ACHIEVEMENT_DEFS merged with UserAchievement rows

export const listRecentRewardEventsInput = z.object({
  limit: z.number().int().min(1).max(50).default(20),
});
export async function listRecentRewardEvents(ctx, input): Promise<RewardEvent[]>; // newest first
```

## tRPC routes (`packages/api/src/router/gamification.ts`, mounted as `gamification`)

- `summary`: protected query → `getGamificationSummary`
- `achievements`: protected query → `listAchievements`
- `recentEvents`: protected query, input `listRecentRewardEventsInput` → `listRecentRewardEvents`

One-liners via `toServiceCtx` (see auth-profile spec).

## UI surfaces

- `apps/nextjs/src/app/_components/gamification/player-stats-card.tsx` — level, XP progress bar, current streaks (badge per kind with a friendly label: "Check-in streak", "Habit streak", "Hydration streak").
- `apps/nextjs/src/app/_components/gamification/achievements-list.tsx` — grid of all achievements, locked ones dimmed, unlock dates shown.
- Mount `PlayerStatsCard` on the home page (`app/page.tsx`); both components are reused by the dashboard feature — keep them presentation-only with data passed via tRPC hooks inside the component (client components using `useTRPC`).

## Seed additions (`packages/db/src/seed.ts` — gamification section)

Seed cannot import `@gamer-health/core` (dependency cycle), so insert rows directly using constants from `@gamer-health/validators`:

1. Delete demo user's `reward_event`, `streak`, `user_achievement` rows (idempotency).
2. For every seeded completed `game_session` → one `session_logged` event; every seeded `habit_prompt` with status `done` → one `habit_prompt_completed`; every seeded `checkin` → one `checkin_completed`. XP/sourceKind from `REWARD_EVENT_DEFS`; spread `createdAt` to match the source rows.
3. Streak rows for the demo user: `daily_checkin` current 3 / longest 5, `daily_habit` current 2 / longest 4, `habit_hydrate` current 1 / longest 3; `lastActivityDate` = today in `America/Chicago`.
4. Unlock `first_session` and `first_checkin` (+ their `achievement_unlocked` events with XP from `ACHIEVEMENT_DEFS`).

## Non-goals

- No XP revocation/negative events, no quests, no leaderboards/social, no notification on unlock (a simple toast on the response of the unlocking mutation is optional polish, not required), no streak rebuild job, no admin UI for achievements.

## Dependencies / emits

- Consumes: events emitted by session-tracking, habit-engine, checkins (they already call `recordRewardEvent`).
- Emits: `achievement_unlocked` (internal).
- Provides to dashboard: `getGamificationSummary`, `listAchievements`, and the two UI components.
