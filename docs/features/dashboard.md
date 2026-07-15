# Feature: Dashboard

**Phase 3 — build last.** Depends on session-tracking, habit-engine, checkins (data) and gamification (summary/achievements components). All reads; no writes, no reward events.

## Goal

A `/dashboard` page showing weekly playtime, habit completion rate, mood/energy trend, a playtime-vs-mood correlation view, and the streak/level summary — computed over the user's own data in their profile timezone.

## Acceptance criteria

- `/dashboard` (signed-in only; redirect `/` otherwise) renders five sections from seeded demo data with no empty charts: player stats (level/XP/streaks), weekly playtime bar chart, habit completion, mood/energy trend, playtime-vs-mood.
- All day bucketing uses the profile timezone; a session is attributed to the local date of its `startedAt`; active sessions are excluded everywhere.
- Every card has a designed empty state (new user with no data sees guidance, not broken charts).
- Range: playtime + habits default to the last 7 days, trends to the last 14, correlation to the last 30 — via the `days` input, not hardcoded in core.
- Unit tests for the aggregation functions against a seeded-ish fixture (insert rows in a test db or factor the SQL so date-bucketing helpers are testable; at minimum test the pure aggregation/merging logic).

## Core services (`packages/core/src/dashboard/`)

All protected (`requireUserId`); `tz` from `getOrCreateProfile`; local dates via `localDateString` (`core/lib/dates.ts`). Prefer SQL aggregation (`sql` template with `(started_at AT TIME ZONE ${tz})::date`) over loading all rows.

```ts
const daysInput = (def: number) =>
  z.object({ days: z.number().int().min(1).max(90).default(def) });

// getPlaytimeByDay.ts — input daysInput(7)
export async function getPlaytimeByDay(ctx, input): Promise<
  { date: string; minutes: number }[] // one entry per local day in range, zero-filled, oldest first
>; // minutes = sum of (endedAt − startedAt) for completed sessions with local(startedAt) in range

// getHabitCompletionStats.ts — input daysInput(7)
export async function getHabitCompletionStats(ctx, input): Promise<{
  done: number; skipped: number; expired: number;
  completionRate: number | null; // done / (done+skipped+expired), null when denominator 0
  byKind: { kind: HabitKind; done: number; total: number }[]; // only kinds with prompts in range
}>; // over habit_prompt rows with local(dueAt) in range; pending excluded

// getWellnessTrend.ts — input daysInput(14)
export async function getWellnessTrend(ctx, input): Promise<
  { date: string; avgMood: number | null; avgEnergy: number | null; avgSleepQuality: number | null }[]
>; // per local day over all checkins (both contexts), zero-filled dates with null values

// getPlaytimeVsWellness.ts — input daysInput(30)
export async function getPlaytimeVsWellness(ctx, input): Promise<
  { date: string; minutes: number; avgMood: number | null }[]
>; // join of the two aggregations per local day; include days with either value
```

Level/streak/achievement data comes from gamification's `getGamificationSummary` / `listAchievements` — do not reimplement.

## tRPC routes (`packages/api/src/router/dashboard.ts`, mounted `dashboard`)

- `playtimeByDay`, `habitCompletion`, `wellnessTrend`, `playtimeVsWellness` — protected queries, inputs as above, one-liners via `toServiceCtx`.

## UI surfaces

`/dashboard` page (`apps/nextjs/src/app/dashboard/page.tsx`), client chart components under `app/_components/dashboard/`. Add **`recharts`** to `apps/nextjs` dependencies (keep alphabetical).

Layout (responsive grid):
1. **PlayerStatsCard** + **AchievementsList** — reuse the gamification components as-is.
2. **Weekly playtime** — bar chart, minutes per day (label hours), 7 days.
3. **Habit completion** — completion-rate stat + per-kind done/total bars, 7 days.
4. **Mood & energy trend** — line chart (two lines, 1–5 y-axis, connect over null gaps), 14 days; include sleep quality as a third line if present.
5. **Playtime vs mood** — composed chart: bars = minutes (left axis), line = avgMood (right axis, 1–5), 30 days.

Add a "Dashboard" nav link on the signed-in home page. Loading skeletons per card; empty state when a query returns all-zero/empty.

## Seed additions

None. This feature relies on the sessions/habits/checkins/gamification seed sections; if any chart looks degenerate from the fresh seed (e.g. too few distinct days), extend **those** sections' density rather than adding a dashboard section, and note it in the PR.

## Non-goals

- No date-range picker (fixed windows per card), no CSV export, no cross-user/social comparisons, no statistical correlation coefficients (visual correlation only), no caching layer, no real-time updates (standard react-query refetch is fine).

## Dependencies / emits

- Uses: `requireUserId`, `CoreError`, `toServiceCtx`, `getOrCreateProfile`, `localDateString`; gamification queries + components.
- Emits: nothing.
