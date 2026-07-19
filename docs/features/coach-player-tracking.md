# Feature: Coach Player Progress Tracking (#12)

**MVP 2, wave 2 — parallel-safe with #13/#14/#15 once #11 lands.**
Issue: [#12](https://github.com/aikepah/gamer-health/issues/12).
Depends on #11 (the active relationship) and #8 (habit definitions).

## Goal

A read-only coach view of a roster player's wellness data — session log,
habit completion, mood/energy trend, playtime-vs-wellness, streaks and level —
reusing the existing dashboard aggregations against an authorized target
user id.

## Fixed decisions (architect — do not revisit)

- **No new tables and no new aggregation logic.** Everything here is an
  existing query pointed at a different `userId`. If a builder finds
  themselves writing a new SQL aggregate, they're off-spec.
- **`assertCoachOf(ctx, playerUserId)` is called exactly once per service, as
  the first statement.** Never derive authorization from the URL, a
  component, or a `coachProcedure` alone — `coachProcedure` proves "is a
  coach", `assertCoachOf` proves "is *this player's* coach".
- **Refactor, don't duplicate.** Several existing services take the caller's
  id implicitly. Extract an explicit-user inner function and make the existing
  export a thin wrapper. This is a pure refactor — no behavior change, and the
  existing unit tests must keep passing untouched:

  | Existing export | Extract | Existing export becomes |
  |---|---|---|
  | `listSessions(ctx, input)` | `listSessionsFor(ctx, userId, input)` | `listSessionsFor(ctx, requireUserId(ctx), input)` |
  | `listCheckins(ctx, input)` | `listCheckinsFor(ctx, userId, input)` | same pattern |
  | `getGamificationSummary(ctx)` | `getGamificationSummaryFor(ctx, userId)` | same pattern |
  | `getHabitCompletionStats(ctx, input)` | `queryHabitCompletionRaw(ctx, userId, tz, startDate, endDate)` | wrapper resolving tz from `getOrCreateProfile` |

  `queryPlaytimeRaw` and `queryWellnessRaw` **already** take an explicit
  `(ctx, userId, tz, startDate, endDate)` — use them as-is; that's the
  pattern the four above are being brought in line with.
- **Target timezone is the PLAYER's** (`profile.timezone ?? "UTC"`), not the
  coach's — the day buckets must match what the player sees on their own
  dashboard. Add a small `getProfileFor(ctx, userId)` reader (a
  `getOrCreateProfile` that takes an explicit id and does NOT create).
- **Coaches see wellness data, not account data.** No email beyond what the
  roster already shows, no role/admin fields, no other coaches' notes.
  Check-in free-text notes ARE included — they're wellness content the player
  wrote while coached, and the point of the feature.
- **One round trip.** The page loads via a single `getCoachPlayerOverview`
  service so the authorization check happens once and the UI can't fan out
  into six separately-authorized queries.

## Acceptance criteria

1. `/coach/players/[playerUserId]` renders, for a roster player: header
   (name, coaching-since, level/XP, streak counters), weekly playtime chart,
   habit completion stats, mood/energy trend, playtime-vs-wellness view, and a
   paginated recent-sessions table — all reusing the player dashboard's chart
   components.
2. A day-range selector (7/14/30) drives every range-based panel.
3. A recent check-ins panel shows mood/energy/sleep and notes, paginated.
4. A coach opening the page for a **non-roster** player gets FORBIDDEN and the
   route redirects to `/coach/roster` with an error toast. Same for an
   `ended` relationship. An **admin** hitting the route also gets FORBIDDEN
   (admins never pass coach checks).
5. Roster entries on `/coach/roster` (#11) link here.
6. Nothing on the page can mutate player data (no buttons that write).

## Core services (`packages/core/src/coaching/players/`)

```ts
// getCoachPlayerOverview.ts
export const getCoachPlayerOverviewInput = z.object({
  playerUserId: z.string().min(1),
  days: z.number().int().min(1).max(90).default(7),
});
export interface CoachPlayerOverview {
  player: { userId: string; name: string; timezone: string };
  relationship: { relationshipId: string; startedAt: Date | null };
  gamification: GamificationSummary;          // existing type
  playtime: PlaytimeByDay[];                  // zero-filled, existing type
  habits: HabitCompletionStats;               // existing type
  wellness: WellnessTrendDay[];               // existing type
  playtimeVsWellness: PlaytimeVsWellnessDay[];// existing type
}
export async function getCoachPlayerOverview(ctx, input): Promise<CoachPlayerOverview>;
// 1. await assertCoachOf(ctx, input.playerUserId)      <- FIRST statement
// 2. resolve player profile + tz + local date range (player's timezone)
// 3. Promise.all over queryPlaytimeRaw / queryWellnessRaw /
//    queryHabitCompletionRaw / getGamificationSummaryFor, then the same
//    zero-fill + aggregate helpers the player dashboard uses
//    (zeroFillPlaytime, zeroFillWellness, aggregateHabitCompletion,
//    mergePlaytimeAndMood). No new maths.

// listCoachPlayerSessions.ts
export const listCoachPlayerSessionsInput = listSessionsInput.extend({
  playerUserId: z.string().min(1),
});
export async function listCoachPlayerSessions(ctx, input): Promise<ListSessionsResult>;
// assertCoachOf, then listSessionsFor(ctx, input.playerUserId, input).

// listCoachPlayerCheckins.ts
export const listCoachPlayerCheckinsInput = listCheckinsInput.extend({
  playerUserId: z.string().min(1),
});
export async function listCoachPlayerCheckins(ctx, input): Promise<ListCheckinsResult>;
// assertCoachOf, then listCheckinsFor(...).
```

## tRPC routes (`packages/api/src/router/coaching/players.ts`, key `players`)

`coachProcedure` one-liners: `overview`, `sessions`, `checkins` (all queries).
`coachProcedure` gates the role; `assertCoachOf` inside each service gates the
specific player.

## UI surfaces

- `apps/nextjs/src/app/coach/players/[playerUserId]/page.tsx` — server
  component fetching `coaching.players.overview`; on a FORBIDDEN/NOT_FOUND
  error, `redirect("/coach/roster")`.
- Reuse the dashboard chart components as-is. If a chart component currently
  fetches its own data, lift the fetch to the page and pass data in as props —
  note that as a small refactor in the PR description.
- Read-only styling: no action buttons, an explicit "Read-only — shared with
  you by <player>" banner.

## Seed additions

None required beyond #11's seeded active relationship (demo coach ↔ demo
player) — the demo player already has sessions, habits, prompts and check-ins
from wave 1, so every panel is populated on a fresh seed. Verify that and say
so in the PR note.

## Non-goals

- No coach notes/annotations on a player (that's adjacent to #13's goals and
  out of scope), no exporting, no cross-player comparison or leaderboards, no
  alerts/thresholds, no editing any player data, no viewing a player's other
  coaches (there are none), no real-time updates.

## Dependencies / provides

- Uses #11 (`assertCoachOf` with a real body — this feature is a no-op
  without it), #8 (habit definitions for `byHabit` titles), and the wave-1
  dashboard/gamification services.
- Provides the `/coach/players/[id]` shell that #13, #14 and #15 hang their
  per-player panels off. If #13/#14/#15 land first, they each create the
  page; whoever is second adds a tab rather than a second route.
