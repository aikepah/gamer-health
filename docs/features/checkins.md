# Feature: Check-ins

**Phase 2 — parallel-safe.** Depends on auth-profile (shared infra, timezone). References `GameSession` through the schema only; the post-session trigger integration is optional at merge time (see UI).

## Goal

10-second wellness entries: mood (required, 1–5), energy (optional, 1–5), sleep quality (optional, 1–5), optional note. Two contexts: `post_session` (offered right after stopping a session, linked to it) and `daily` (once per local day, offered via a home-page card). Each check-in emits `checkin_completed`.

## Acceptance criteria

- Signed-in user sees a "Daily check-in" card on the home page when they have no `daily` check-in for today (profile timezone); submitting hides the card and awards +10 XP once.
- A second `daily` check-in on the same local day is rejected (`CoreError CONFLICT`); a second `post_session` check-in for the same session likewise.
- Stopping a session opens the check-in dialog pre-set to `post_session` with the session linked (when session-tracking is merged); skipping it is allowed and records nothing.
- Mood outside 1–5 (and energy/sleep when present) rejected at the Zod layer; check-in history is visible (simple list, newest first).
- Vitest tests for the once-per-day guard (timezone-sensitive: use an injectable `now`).

## Core services (`packages/core/src/checkins/`)

```ts
// createCheckin.ts
export const createCheckinInput = CreateCheckinSchema; // from @gamer-health/db/schema
// (context, sessionId?, mood required 1–5, energy/sleepQuality nullish 1–5, note ≤1000)
export async function createCheckin(ctx, input): Promise<Checkin>;
// Guards (CoreError):
// - context "daily": reject with CONFLICT if a daily check-in already exists whose
//   createdAt falls on today's local date (profile timezone via getOrCreateProfile
//   + localDateString from core/lib/dates — see habit-engine spec; if that file
//   doesn't exist in this worktree yet, create it exactly per that spec).
// - context "post_session": sessionId required (BAD_REQUEST if missing); session
//   must belong to the user (NOT_FOUND); CONFLICT if a post_session check-in for
//   that session already exists.
// Insert, then recordRewardEvent(ctx, { eventType: "checkin_completed", sourceId: checkin.id }).

// getTodayStatus.ts — no input
export async function getTodayCheckinStatus(ctx): Promise<{ hasDaily: boolean }>;

// listCheckins.ts
export const listCheckinsInput = z.object({
  limit: z.number().int().min(1).max(100).default(30),
  offset: z.number().int().min(0).default(0),
});
export async function listCheckins(ctx, input): Promise<{
  items: (Checkin & { session: (GameSession & { game: Game }) | null })[];
  total: number;
}>;
```

**Reward events:** create the two canonical shared files from `docs/features/gamification.md` §"Shared contract" if absent.

The once-per-day/per-session guards are service-level (no DB constraint possible for timezone-local days); acceptable MVP race window.

## tRPC routes (`packages/api/src/router/checkin.ts`, mounted `checkin`)

- `create`: protected mutation, input `CreateCheckinSchema` → `createCheckin`
- `todayStatus`: protected query → `getTodayCheckinStatus`
- `list`: protected query, input `listCheckinsInput` → `listCheckins`

## UI surfaces

- **`CheckinDialog`** (`app/_components/checkins/checkin-dialog.tsx`, client): mood/energy/sleep as 5-button rating rows (mood required; energy/sleep optional with a "skip" affordance), note textarea, submit → `checkin.create`. Props: `{ context, sessionId?, open, onOpenChange }`. Sleep-quality row shown only for `daily` context.
- **Daily check-in card** on the home page: rendered when `checkin.todayStatus.hasDaily === false`; opens the dialog with `context: "daily"`.
- **Post-session trigger**: export `CheckinDialog` so session-tracking's stop flow can open it (`context: "post_session"`, `sessionId`). If session-tracking merges first, its builder wires the guarded integration; whichever lands second completes the wiring — note it in the PR.
- **History**: a compact "Recent check-ins" list (date, context badge, mood/energy icons, note) — put it on the home page below the card; the dashboard feature adds trend charts separately.

## Seed additions (`packages/db/src/seed.ts` — checkins section)

For the demo user (delete-then-insert their `checkin` rows): ~12 check-ins over the last 14 days — one `daily` on most days (varying mood 2–5, energy 2–5, sleepQuality 1–5, a couple of notes), plus `post_session` check-ins linked to 3 of the seeded sessions (mood correlating loosely with session length for an interesting dashboard). **None for today** so the daily card is visible from a fresh seed.

## Non-goals

- No editing/deleting check-ins, no reminder notifications for check-ins (habit prompts cover nudging), no free-form tags, no weekly summaries (dashboard handles trends), no backdated check-in entry UI.

## Dependencies / emits

- Uses: `requireUserId`, `CoreError`, `toServiceCtx`, `getOrCreateProfile`, `localDateString`.
- Emits: `checkin_completed` (sourceKind `checkin`, sourceId = checkin id, +10 XP).
- Provides: mood/energy/sleep data for the dashboard's wellness trend and playtime-vs-mood charts; `CheckinDialog` for session-tracking's stop flow.
