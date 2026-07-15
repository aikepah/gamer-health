# Feature: Session Tracking

**Phase 2 — parallel-safe.** Depends on auth-profile (shared infra). Independent of habit-engine and checkins at build time (they reference sessions only through the schema, which already exists).

## Goal

Manual gaming-session tracking: start/stop a live timer, log a past session retroactively, pick the game from a simple catalog (seeded list + free-text creation). Schema anticipates Steam sync via `source` (always `"manual"` in MVP).

## Acceptance criteria

- Signed-in user can start a session for a game; the home page shows an active-session card with game name and a live elapsed timer; starting a second session while one is active fails with a clear CONFLICT error.
- Stopping the active session sets `endedAt`, emits `session_logged` (+10 XP, once), and triggers the post-session check-in dialog **if the checkins feature is present** (integration point below; guard so this feature works standalone).
- User can retro-log a session (game, start, end, optional notes); end > start and end ≤ now enforced (`CoreError BAD_REQUEST`).
- Game picker autocompletes from the catalog (case-insensitive substring); entering an unknown name creates the game once (case-insensitive dedupe via the `lower(name)` unique index).
- `/sessions` lists the user's sessions (game, date, duration, notes), newest first, and supports edit + delete of completed sessions.
- Vitest unit tests for the time-validation logic.

## Schema (already in `packages/db/src/schema.ts` — do not change)

`Game`, `GameSession` (table `game_session`; Better Auth owns `session`). Constraints to rely on: one active session per user (partial unique index on `userId WHERE ended_at IS NULL`), `ended_at > started_at` check, `LogGameSessionSchema` insert schema.

## Core services (`packages/core/src/sessions/`)

All take `(ctx: ServiceCtx, input)` and use `requireUserId`. Every session read/write is scoped `WHERE userId = ctx.userId`; operating on another user's row → `CoreError("NOT_FOUND")`.

```ts
// games.ts
export const searchGamesInput = z.object({
  query: z.string().trim().max(256).default(""),
  limit: z.number().int().min(1).max(25).default(10),
});
export async function searchGames(ctx, input): Promise<Game[]>;
// ilike %query% on name, ordered by name; empty query returns first N alphabetically

export const getOrCreateGameInput = z.object({
  name: z.string().trim().min(1).max(256),
  platform: z.string().trim().min(1).max(64).optional(),
});
export async function getOrCreateGame(ctx, input): Promise<Game>;
// select where lower(name) = lower(input.name); insert if missing
// (onConflictDoNothing + re-select to handle races)

// startSession.ts
export const startSessionInput = z.object({
  gameId: z.uuid(),
  notes: z.string().max(2000).optional(),
});
export async function startSession(ctx, input): Promise<GameSession>;
// startedAt = now, endedAt = null, source "manual".
// If an active session exists → CoreError("CONFLICT", "A session is already active").

// stopSession.ts
export const stopSessionInput = z.object({}); // always stops the caller's active session
export async function stopSession(ctx, input): Promise<GameSession>;
// find active session (endedAt null) → NOT_FOUND if none; set endedAt = now;
// then recordRewardEvent(ctx, { eventType: "session_logged", sourceId: session.id })

// logSession.ts  (retroactive)
export const logSessionInput = LogGameSessionSchema; // from @gamer-health/db/schema (gameId, startedAt, endedAt required, notes)
export async function logSession(ctx, input): Promise<GameSession>;
// BAD_REQUEST unless startedAt < endedAt && endedAt <= now; insert completed session;
// recordRewardEvent(ctx, { eventType: "session_logged", sourceId: session.id })

// getActiveSession.ts — no input
export async function getActiveSession(ctx): Promise<(GameSession & { game: Game }) | null>;

// listSessions.ts
export const listSessionsInput = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});
export async function listSessions(ctx, input): Promise<{
  items: (GameSession & { game: Game })[];
  total: number;
}>; // ordered startedAt desc; from/to filter on startedAt

// updateSession.ts — completed sessions only
export const updateSessionInput = z.object({
  id: z.uuid(),
  gameId: z.uuid().optional(),
  startedAt: z.date().optional(),
  endedAt: z.date().optional(),
  notes: z.string().max(2000).nullish(),
});
export async function updateSession(ctx, input): Promise<GameSession>;
// BAD_REQUEST if target session is active or resulting times violate start < end <= now

// deleteSession.ts
export const deleteSessionInput = z.object({ id: z.uuid() });
export async function deleteSession(ctx, input): Promise<{ deleted: true }>;
```

**Reward events:** create the two canonical shared files (`packages/validators/src/gamification.ts`, `packages/core/src/gamification/events.ts`) exactly as specified in `docs/features/gamification.md` §"Shared contract" if absent. Emit `session_logged` only when a session becomes completed (stop or retro log) — never on start, never on update. Editing/deleting does not add or revoke XP (the dedupe index makes accidental re-emission a no-op; revocation is a documented non-goal).

## tRPC routes

`packages/api/src/router/game.ts` (mounted `game`): `search` (protected query), `getOrCreate` (protected mutation).
`packages/api/src/router/game-session.ts` (mounted `gameSession`): `start`, `stop`, `log`, `update`, `delete` (protected mutations); `active`, `list` (protected queries). All one-liners via `toServiceCtx`.

## UI surfaces

- **Active session card** (`app/_components/sessions/active-session-card.tsx`), mounted on the home page: when no active session → game autocomplete (combobox over `game.search`, "create «name»" option calling `game.getOrCreate`) + Start button; when active → game name, elapsed time ticking client-side from `startedAt`, Stop button. On stop: invalidate queries; if the checkins feature's `CheckinDialog` exists, open it with `{ context: "post_session", sessionId }` — integrate behind a small dynamic import/optional component so this feature merges independently.
- **`/sessions` page**: retro-log form (game picker, datetime-local start/end, notes) + paginated session list with edit (inline dialog) and delete (confirm). Duration displayed as `1h 23m`.

## Seed additions (`packages/db/src/seed.ts` — session-tracking section)

- ~10 catalog games (`onConflictDoNothing` on the name index): e.g. Elden Ring, Baldur's Gate 3, Hades II, Stardew Valley, Fortnite, League of Legends, Minecraft, Zelda: TotK, Rocket League, Cyberpunk 2077 (platform "PC" or console where apt).
- For the demo user (lookup by `DEMO_EMAIL`; delete-then-insert this user's `game_session` rows): 8–10 **completed** sessions spread over the last 14 days at deterministic offsets (e.g. day −13 … −1, durations 45–180 min, varied games, a couple with notes, one late-night session ending after 23:00 local for dashboard interest). **No active session** (so the start flow is testable from seed).

## Non-goals

- No Steam/console sync (only `source: "manual"`), no overlap detection between sessions, no session splitting across midnight (dashboard attributes a session to its start date), no pause/resume, no multi-device conflict handling beyond the one-active-session constraint, no XP revocation on delete.

## Dependencies / emits

- Uses: `requireUserId`, `CoreError`, `toServiceCtx` (auth-profile).
- Emits: `session_logged` (sourceKind `game_session`, sourceId = session id, +10 XP).
- Provides: `GameSession` rows consumed by habit-engine (active-session prompts), checkins (post-session), dashboard (playtime charts); `getActiveSession` used by habit-engine's sync.
