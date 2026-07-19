# Feature: Coach Discovery & Application (#10)

**MVP 2, wave 2 — after #9; blocks #11.**
Issue: [#10](https://github.com/aikepah/gamer-health/issues/10). Depends on #9.

## Goal

Players browse and filter published coaches, open a coach's public profile,
and apply to be coached. An application creates a `coaching_relationship` row
in `applied`; the coach acts on it in #11.

## Fixed decisions (architect — do not revisit)

- **No new tables.** Discovery is a query over `coach_profile` × `profile` ×
  `user` with `EXISTS` sub-queries against `coach_game` and
  `coach_availability`. The indexes it needs
  (`coach_profile_published_idx`, `coach_game_game_idx`,
  `coach_availability_coach_weekday_idx`) already landed with #9's schema.
- **Visibility predicate (single definition, reused everywhere):** a coach is
  discoverable iff `coach_profile.isPublished` AND `profile.role = 'coach'`
  AND `profile.deactivatedAt IS NULL`. Put it in one exported helper
  (`publishedCoachWhere()`) so #10's list and #9's `getPublicCoachProfile`
  can't drift.
- **Availability filter semantics:** `weekdays` (any-of) and an optional
  `[fromMinute, toMinute)` window, matched by **overlap** (`block.start <
  toMinute AND block.end > fromMinute`) in the **coach's own local time**.
  Cross-timezone matching is a non-goal; the UI labels every time as the
  coach's local time.
- **A player may hold several `applied` rows at once**, to different coaches.
  Shopping around is the point of discovery. The DB blocks only a *duplicate*
  open application to the same coach (`coaching_relationship_open_pair_idx`).
- **A player with an active coach cannot apply** — `CONFLICT("You already
  have a coach — end that relationship first")`. This keeps the one-active
  invariant (see `coaching-relationships.md`) out of the 23505 path.
- **Payment gate is NOT here.** Applying is always free; the future
  subscription check belongs on *acceptance* (#11). Do not add payment
  fields, screens, or copy.

## Acceptance criteria

1. `/coaches` lists published coaches (name, headline, specialty chips, games,
   availability summary) with offset pagination (20/page).
2. Filters: free-text query (name or headline, ILIKE), game (autocomplete
   against the catalog), specialty multi-select, weekday multi-select +
   optional time window. Filters combine with AND; each is independently
   optional and reflected in the URL query string.
3. `/coaches/[coachUserId]` renders the full public profile (reusing #9's
   `CoachProfileCard`) with an Apply button and an optional message field.
4. Applying persists an `applied` relationship, shows a success state, and the
   button becomes "Application pending" with a Withdraw action. Applying twice
   to the same coach is impossible (button state + server `CONFLICT`).
5. A coach with `acceptingApplications = false` renders as "Not accepting new
   players" with the Apply button disabled; the server rejects anyway.
6. An unpublished or deactivated coach's detail URL 404s.
7. `/coaches` also shows the player's own pending applications at the top,
   each withdrawable.

## Core services (`packages/core/src/coaching/discovery/`)

```ts
// searchCoaches.ts
export const searchCoachesInput = z.object({
  query: z.string().trim().max(120).optional(),        // ILIKE user.name OR headline
  gameId: z.uuid().optional(),
  specialties: z.array(z.enum(COACH_SPECIALTIES)).max(8).optional(),  // any-of
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),// any-of
  fromMinute: z.number().int().min(0).max(1439).optional(),
  toMinute: z.number().int().min(1).max(1440).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
});
export interface CoachSearchRow {
  userId: string;
  name: string;
  headline: string | null;
  specialties: CoachSpecialty[];
  acceptingApplications: boolean;
  games: { id: string; name: string }[];
  availability: { weekday: number; startMinute: number; endMinute: number }[];
  timezone: string;                       // profile.timezone ?? "UTC"
  /** The caller's own open relationship with this coach, if any. */
  myRelationship: { id: string; status: CoachingRelationshipStatus } | null;
}
export async function searchCoaches(ctx, input): Promise<{
  total: number; coaches: CoachSearchRow[];
}>;
// requireActiveUser. Base query: coach_profile JOIN profile JOIN user, filtered by
// publishedCoachWhere(). gameId → EXISTS (coach_game). specialties → array
// overlap (`&&`). weekdays/time window → EXISTS (coach_availability) with the
// overlap predicate above. Order by user.name asc, userId asc (stable paging).
// Fetch games/availability/myRelationship for the PAGE ONLY, in three follow-up
// `inArray` queries — never a per-row N+1 and never a fan-out join that breaks
// the count.

// applyToCoach.ts
export const applyToCoachInput = z.object({
  coachUserId: z.string().min(1),
  message: z.string().trim().max(1000).optional(),
});
export async function applyToCoach(ctx, input): Promise<{ relationshipId: string }>;
// requireActiveUser (any role may apply except the coach themselves).
// Guards, in order:
//   - coachUserId === caller            → BAD_REQUEST("You can't coach yourself")
//   - coach not discoverable            → NOT_FOUND("Coach not found")
//   - !acceptingApplications            → CONFLICT("This coach isn't accepting new players")
//   - caller has any status='active' relationship
//                                        → CONFLICT("You already have a coach — end that relationship first")
//   - caller already has an open (applied|active) row with this coach
//                                        → CONFLICT("You've already applied to this coach")
// Insert { playerUserId: caller, coachUserId, status: 'applied',
//          initiatedByUserId: caller, message, appliedAt: now }.
// Wrap the insert in isUniqueViolation(err) → CONFLICT to cover the race
// against the open-pair partial unique index.

// withdrawApplication.ts
export const withdrawApplicationInput = z.object({ relationshipId: z.uuid() });
export async function withdrawApplication(ctx, input): Promise<void>;
// requireActiveUser; row must exist, belong to the caller as playerUserId, and
// be status 'applied' (else CONFLICT "This application can no longer be
// withdrawn"). Set status='withdrawn', respondedAt=now.

// listMyApplications.ts
export async function listMyApplications(ctx): Promise<{
  relationshipId: string; status: CoachingRelationshipStatus;
  appliedAt: Date; respondedAt: Date | null; responseNote: string | null;
  coach: { userId: string; name: string; headline: string | null };
}[]>;
// requireActiveUser; the caller's relationships as player, newest first,
// excluding status 'active' (that one is #11's "my coach" card).
```

## tRPC routes (`packages/api/src/router/coaching/discovery.ts`, key `discovery`)

All `protectedProcedure` one-liners: `search` (query), `apply` (mutation),
`withdraw` (mutation), `myApplications` (query). Add the single
`discovery: discoveryRouter` key to `coaching/index.ts`.

## UI surfaces

- `/coaches` — filter bar (debounced text input, game autocomplete, specialty
  chips, weekday toggles, time-range select), results grid of coach cards,
  prev/next paging, "Your applications" panel above the grid with Withdraw
  buttons. Empty state when no coach matches.
- `/coaches/[coachUserId]` — `CoachProfileCard` (from #9) + apply panel
  (message textarea, Apply button) whose state derives from `myRelationship`:
  none → Apply; `applied` → "Pending" + Withdraw; `active` → "This is your
  coach" link to the my-coach card; `declined`/`ended`/`withdrawn` → Apply
  again.
- Add a "Find a coach" entry to the player nav.

## Seed additions

- `player1` (Riley Chen) has an `applied` relationship to the demo coach with
  a message — so #11's coach roster has a pending application on first load.
- `player2` (Sam Okafor) has an `applied` relationship to BOTH seeded
  published coaches, exercising the multi-application case and the
  auto-decline path in #11.

## Non-goals

- No payments/subscriptions (nothing at all, not even a placeholder screen),
  no coach ratings/reviews, no messaging/chat, no recommendation ranking or
  relevance scoring (deterministic name ordering), no saved searches or
  favourites, no email notification of an application, no cross-timezone
  availability conversion.

## Dependencies / provides

- Uses #9: `coach_profile`, `coach_game`, `coach_availability`,
  `getPublicCoachProfile`, `CoachProfileCard`, the `coaching` router skeleton.
- Provides to #11: `applied` relationship rows to accept/decline, and
  `publishedCoachWhere()`.
