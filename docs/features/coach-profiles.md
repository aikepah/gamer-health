# Feature: Coach Profiles (#9)

**MVP 2, wave 2 — builds first in wave 2; blocks #10 and #15.**
Issue: [#9](https://github.com/aikepah/gamer-health/issues/9). Depends on #4.

## Goal

A coach-editable public profile — headline, bio, specialties, games coached,
weekly recurring availability — plus the publish gate that makes a coach
visible in discovery (#10) and the availability data scheduling (#15)
validates proposed slots against.

## Fixed decisions (architect — do not revisit)

- **`coach_profile` is a separate table, not columns on `profile`.**
  `profile` is every user's private app data; `coach_profile` is public and
  coach-only. Created lazily by `getOrCreateCoachProfile` the first time a
  coach opens `/coach/profile` — never for players.
- **No coach timezone column.** Availability blocks are wall-clock times in
  the coach's `profile.timezone`. One source of truth; a coach who changes
  their profile timezone moves their availability with it (documented in the
  UI with a hint line).
- **Availability is minutes-from-local-midnight** (`weekday` 0=Sun..6=Sat,
  `startMinute` inclusive, `endMinute` exclusive, both 0..1440). Blocks never
  cross midnight — a 22:00–02:00 coach makes two blocks. Overlapping blocks on
  the same weekday are rejected in core (`BAD_REQUEST`); the DB only dedupes
  exact duplicates.
- **`specialties` is a closed set** (`COACH_SPECIALTIES` in
  `@gamer-health/validators`), stored as `text[]` exactly like
  `profile.platforms`. Discovery filters on exact values with no
  normalization step.
- **Two independent booleans**: `isPublished` (listed in discovery at all) and
  `acceptingApplications` (listed, but `applyToCoach` rejects). A coach with a
  full roster delists applications without delisting themselves.
- **Publish preconditions** (checked in `setCoachPublished`, not the DB):
  non-null `profile.timezone`, a non-empty `headline`, ≥1 game, ≥1
  availability block. Failing any → `BAD_REQUEST` naming the missing piece.
- **`coaching` tRPC router shape (owned by this issue).** Create
  `packages/api/src/router/coaching/index.ts` exporting
  `coachingRouter = createTRPCRouter({ profile })`, mounted as `coaching` in
  `root.ts`. #10–#15 each add exactly ONE key to that object
  (`discovery`, `relationships`, `players`, `goals`, `assignedHabits`,
  `sessions`) in their own file — this is what keeps their `root.ts` merges
  conflict-free, same as the `admin` router in wave 1.

## Acceptance criteria

1. `/coach/profile` (coach-only route group from #4) lets a coach edit
   headline, bio and specialty chips, and save.
2. A "Games I coach" section adds/removes games using the existing game
   autocomplete (`game.search` / `getOrCreateGame`), persisting to
   `coach_game`.
3. A weekly availability editor adds/removes blocks per weekday
   (time pickers → minutes); overlapping or inverted blocks are rejected with
   a clear message; times are labelled with the coach's timezone.
4. A publish toggle flips `isPublished`; attempting to publish an incomplete
   profile shows exactly which precondition is missing. An
   "Accepting new players" toggle flips `acceptingApplications` independently.
5. `getPublicCoachProfile` returns the profile only when it is published (or
   the caller is the coach themselves); an unpublished coach is `NOT_FOUND`
   to everyone else.
6. Merging games (admin, #7) preserves coach associations — see
   "Interop with #7" below; regression test proves it.

## Core services (`packages/core/src/coaching/profile/`)

```ts
// getOrCreateCoachProfile.ts
export interface CoachProfileDetail {
  userId: string;
  name: string;              // from auth `user`
  headline: string | null;
  bio: string | null;
  specialties: CoachSpecialty[];
  isPublished: boolean;
  acceptingApplications: boolean;
  timezone: string | null;   // from profile — null blocks publishing
  games: { id: string; name: string; platform: string | null }[];
  availability: AvailabilityBlock[];   // sorted weekday, then startMinute
}
export interface AvailabilityBlock {
  id: string; weekday: number; startMinute: number; endMinute: number;
}
export async function getOrCreateCoachProfile(ctx): Promise<CoachProfileDetail>;
// requireRole(ctx, ["coach"]); insert { specialties: [] } onConflictDoNothing.

// updateCoachProfile.ts
export const updateCoachProfileInput = z.object({
  headline: z.string().trim().min(1).max(120).nullish(),
  bio: z.string().max(4000).nullish(),
  specialties: z.array(z.enum(COACH_SPECIALTIES)).max(8).default([]),
});
export async function updateCoachProfile(ctx, input): Promise<CoachProfileDetail>;
// requireRole coach; getOrCreateCoachProfile first; update the row.

// setCoachPublished.ts
export const setCoachPublishedInput = z.object({ published: z.boolean() });
export async function setCoachPublished(ctx, input): Promise<{ isPublished: boolean }>;
// requireRole coach. published=true → enforce the four preconditions above
// (BAD_REQUEST with the specific missing piece). published=false always allowed;
// it does NOT touch existing relationships (an unpublished coach keeps their roster).

// setCoachAcceptingApplications.ts — same shape, boolean `accepting`, no preconditions.

// setCoachGames.ts
export const setCoachGamesInput = z.object({
  gameIds: z.array(z.uuid()).max(20),
});
export async function setCoachGames(ctx, input): Promise<CoachProfileDetail["games"]>;
// requireRole coach. Replace-set semantics in ONE transaction: every id must
// exist (NOT_FOUND otherwise); delete coach_game rows not in the set; insert
// the new ones with onConflictDoNothing.

// setCoachAvailability.ts
export const availabilityBlockInput = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});
export const setCoachAvailabilityInput = z.object({
  blocks: z.array(availabilityBlockInput).max(40),
});
export async function setCoachAvailability(ctx, input): Promise<AvailabilityBlock[]>;
// requireRole coach. Validate in core BEFORE writing: endMinute > startMinute
// (BAD_REQUEST "Block must end after it starts"), and no two blocks on the
// same weekday overlap (sort per weekday, compare neighbours → BAD_REQUEST
// "Availability blocks overlap"). Replace-set in one transaction (delete all
// then insert) — availability is small and always edited as a whole.

// getCoachAvailability.ts
export const getCoachAvailabilityInput = z.object({ coachUserId: z.string().min(1) });
export async function getCoachAvailability(ctx, input): Promise<{
  timezone: string;                 // coach's profile.timezone ?? "UTC"
  blocks: AvailabilityBlock[];
}>;
// protectedProcedure-level: any signed-in user may read a PUBLISHED coach's
// availability (discovery + scheduling need it), plus the coach's own.
// Otherwise NOT_FOUND. #15 consumes this.

// getPublicCoachProfile.ts
export const getPublicCoachProfileInput = z.object({ coachUserId: z.string().min(1) });
export async function getPublicCoachProfile(ctx, input): Promise<CoachProfileDetail>;
// requireActiveUser. NOT_FOUND unless (isPublished AND profile.role='coach'
// AND profile.deactivatedAt IS NULL) OR caller === coachUserId. Never leaks
// whether an unpublished profile exists.
```

## Interop with #7 (`mergeGames`) — REQUIRED, this issue owns the change

`packages/core/src/admin/content/mergeGames.ts` carries a wave-2 TODO at the
point where `coach_game` must be repointed. Replace that comment with the
two statements below, **inside the existing transaction, before the source
game is deleted**. A plain `UPDATE ... SET game_id = target` is wrong: it
violates the `(coach_user_id, game_id)` primary key whenever a coach coaches
both games.

```ts
// Repoint coaches-coached rows. Insert-then-delete (not UPDATE): a coach may
// already coach the target game, and the PK would reject the update.
await tx.execute(sql`
  INSERT INTO coach_game (coach_user_id, game_id, created_at)
  SELECT coach_user_id, ${input.targetGameId}::uuid, created_at
  FROM coach_game WHERE game_id = ${input.sourceGameId}::uuid
  ON CONFLICT DO NOTHING
`);
await tx.delete(CoachGame).where(eq(CoachGame.gameId, input.sourceGameId));
```

Also extend `deleteGame`'s pre-check: after the `game_session` count, count
`coach_game` rows for the game and throw
`CONFLICT("Coaches list this game — merge it into another game instead")`
when > 0. Without this, `coach_game`'s `ON DELETE CASCADE` would silently
drop coach associations.

Add a `mergeGames` unit test where both coaches, one coach, and neither coach
already coach the target.

## tRPC routes (`packages/api/src/router/coaching/profile.ts`, key `profile`)

- `getMine` — `coachProcedure.query` → `getOrCreateCoachProfile`
- `update`, `setGames`, `setAvailability`, `setPublished`, `setAccepting` —
  `coachProcedure.mutation` one-liners
- `getPublic` — `protectedProcedure.input(getPublicCoachProfileInput).query`
- `getAvailability` — `protectedProcedure.input(getCoachAvailabilityInput).query`

## UI surfaces

- `apps/nextjs/src/app/coach/profile/page.tsx` — the editor: headline + bio
  fields, specialty chip multi-select, games autocomplete list, weekly
  availability grid (one row per weekday, add/remove time ranges), publish and
  accepting-applications switches, a "what's missing to publish" checklist.
- Add a "Coach" nav group (visible when `authz.role === "coach"`) with
  Profile; #10–#15 append their entries.
- Public profile card component (`CoachProfileCard`) rendering name, headline,
  specialties, games, availability summary — **reused verbatim by #10's
  coach detail page**, so put it in `apps/nextjs/src/app/_components/coaching/`.

## Seed additions (`packages/db/src/seed.ts`)

- Give the existing `coach@gamerhealth.dev` account a published coach profile:
  headline, bio, specialties `["Sleep", "Focus & Attention"]`, two seeded
  games, and availability Mon/Wed/Fri 17:00–20:00 (`1020`–`1200`) plus Sat
  10:00–14:00 (`600`–`840`).
- Add a **second** coach `coach2@gamerhealth.dev` / `coach2234`
  ("Dana Whitfield", role `coach`), published, different games/specialties and
  Tue/Thu availability — discovery (#10) needs more than one result and #11
  needs a second coach to test multi-application.
- Add a third, **unpublished** coach `coach3@gamerhealth.dev` / `coach3234`
  ("Unlisted Coach") so the publish gate is verifiable from a fresh seed.

## Non-goals

- No rates/pricing, no payments, no reviews or ratings, no profile photos or
  uploads, no rich text, no coach search ranking (that's #10), no date-specific
  availability exceptions/holidays (weekly recurring only), no cross-timezone
  availability rendering (times shown in the coach's timezone with a label).

## Dependencies / provides

- Uses #4: `requireRole`, `coachProcedure`, coach layout guard, seeded coach.
  Uses the existing game catalog services.
- Provides to #10: `getPublicCoachProfile`, `coach_game`/`coach_availability`
  for filtering, `isPublished`/`acceptingApplications`, `CoachProfileCard`.
  Provides to #15: `getCoachAvailability` and the block model.
  Provides to all of wave 2: the `coaching` tRPC router skeleton.
