# Feature: Roles & Authorization Foundation (#4)

**MVP 2, wave 1 — builds first; blocks #5, #6, #7, #8 (and all of wave 2).**
Issue: [#4](https://github.com/aikepah/gamer-health/issues/4).

## Goal

Every user has an app-level role — `player` (default), `coach`, `admin` — plus
the authorization plumbing the rest of MVP 2 builds on: core `requireRole` /
`assertCoachOf` helpers, tRPC `adminProcedure` / `coachProcedure`, role-aware
navigation, and seeded demo admin/coach accounts.

## Fixed decisions (architect — do not revisit)

- **Role lives on `profile.role`** (already in schema, enum `user_role`,
  default `player`), NOT on Better Auth's `user`: `auth-schema.ts` is
  generated and must never be hand-edited, while `Profile` is the app-owned
  1:1 extension of `user`. **A user with no profile row is an active player**
  — never create profile rows just to read a role.
- `profile.deactivatedAt` (null = active) also ships in this schema; #4 only
  *enforces* it (deactivated → FORBIDDEN everywhere); the admin UI that sets
  it is #5.
- Role values come from `USER_ROLES` in `@gamer-health/validators` (the pg
  enum is built from it). Use it for Zod inputs and UI badges.
- **Admins do not implicitly pass coach checks.** `coachProcedure` and
  `assertCoachOf` accept role `coach` only. Admins manage accounts/content;
  they never see player wellness data through coach surfaces.
- **`assertCoachOf` ships deny-all.** The coaching-relationship table is
  wave 2 (#11). The helper's signature and call sites are final now; its
  wave-1 body verifies the caller is an active coach and then always throws
  `FORBIDDEN("No active coaching relationship")`. #11 replaces only the final
  throw with a `status = 'active'` relationship lookup. This is deliberate:
  deny-by-default means nothing built against the contract can leak data
  before #11 lands.

## Acceptance criteria

1. `profile.role` drives access: an admin sees the Admin nav section and can
   load `/admin`; players/coaches get a redirect from `/admin/*` and no nav
   entry. (Coach nav/route group: same helper, but there are no coach pages
   in wave 1 — gate exists, renders nothing yet.)
2. A deactivated user (set `deactivated_at` via SQL for now) receives
   FORBIDDEN from every protected tRPC procedure.
3. `adminProcedure` / `coachProcedure` exist and reject wrong roles with
   FORBIDDEN, unauthenticated with UNAUTHORIZED.
4. Seed produces `admin@gamerhealth.dev` / `admin1234` (admin) and
   `coach@gamerhealth.dev` / `coach1234` (coach); demo user stays a player.
5. `assertCoachOf` exists, is exported from core, and always denies (unit
   test proves both the role check and the deny).

## Core services (`packages/core/src/authz/`)

```ts
// getAuthz.ts
export interface Authz {
  userId: string;
  role: UserRole;            // from @gamer-health/validators
  deactivated: boolean;
}
export async function getAuthz(ctx: ServiceCtx): Promise<Authz>;
// requireUserId; single Profile PK lookup; missing row → { role: "player",
// deactivated: false }. Does NOT throw on deactivated.

// requireRole.ts
export async function requireActiveUser(ctx: ServiceCtx): Promise<Authz>;
// getAuthz + CoreError("FORBIDDEN", "Account deactivated") when deactivated.
export async function requireRole(
  ctx: ServiceCtx,
  roles: readonly UserRole[],
): Promise<Authz>;
// requireActiveUser + FORBIDDEN unless roles.includes(role). No implicit admin.

// assertCoachOf.ts
export async function assertCoachOf(
  ctx: ServiceCtx,
  playerUserId: string,
): Promise<void>;
// Wave 1: await requireRole(ctx, ["coach"]); then unconditionally
// throw new CoreError("FORBIDDEN", "No active coaching relationship");
// Wave 2 (#11) replaces the throw with the relationship lookup. Keep the
// playerUserId parameter referenced (underscore-prefix is fine) so the
// signature is stable.
```

No Zod schemas needed — these take no client input.

## tRPC (`packages/api/src/trpc.ts` + router skeleton)

- Extend `protectedProcedure` with an authz middleware: build the ServiceCtx,
  `const authz = await getAuthz(...)`; throw `TRPCError FORBIDDEN` if
  `authz.deactivated`; pass `authz` through `next({ ctx: { authz } })`. Yes,
  this is one profile lookup per protected request — accepted for MVP.
- `export const adminProcedure = protectedProcedure` + middleware throwing
  FORBIDDEN unless `ctx.authz.role === "admin"`. Same for `coachProcedure`
  with `"coach"`.
- Create `packages/api/src/router/admin/index.ts`:
  `export const adminRouter = createTRPCRouter({})` mounted as `admin` in
  `root.ts`. #5/#6/#7 each add one key (`users`, `invites`, `content`) to
  this file — this is what keeps their root.ts merges conflict-free.
- Add `authz` protected query to the existing `profile` router →
  `getAuthz` (nav + layouts consume it).

## UI surfaces

- Nav header (`apps/nextjs` app shell): fetch `profile.authz` server-side;
  render an "Admin" link group (→ `/admin/users`, `/admin/invites`,
  `/admin/content` — pages land in #5/#6/#7; link only to routes that exist
  at merge time, finishing with a placeholder `/admin` index page is fine).
- `apps/nextjs/src/app/admin/layout.tsx`: server component; `profile.authz`;
  `redirect("/")` unless role admin and not deactivated. Create the matching
  `app/coach/layout.tsx` guard (role coach) even though no coach pages exist
  yet.

## Seed additions (`packages/db/src/seed.ts` — roles section, runs right after `seedDemoUser`)

- `seedRoles()`: create (idempotently, same Better Auth sign-up pattern as
  the demo user) `admin@gamerhealth.dev`/`admin1234` ("Demo Admin") and
  `coach@gamerhealth.dev`/`coach1234` ("Demo Coach"); upsert their profiles
  with `role: "admin"` / `"coach"`, `timezone: "America/Chicago"`,
  `platforms: []`. Return both ids for later sections.
- Env bootstrap: if `BOOTSTRAP_ADMIN_EMAIL` is set and a user with that email
  exists, upsert that profile's role to `admin`. Add the variable (commented)
  to `.env.example`.

## Non-goals

- No role management UI (#5), no invitations (#6), no coaching-relationship
  logic beyond the deny-all stub (#11), no per-resource permission matrix,
  no impersonation, no admin bypass of the coach privacy gate.

## Dependencies / provides

- Uses existing: `requireUserId`, `CoreError`, `toServiceCtx`, `Profile`.
- Provides to #5–#15: `getAuthz`, `requireActiveUser`, `requireRole`,
  `assertCoachOf`, `adminProcedure`, `coachProcedure`, the `admin` router
  skeleton, admin/coach layout guards, seeded admin+coach accounts.
