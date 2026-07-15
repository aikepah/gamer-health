# Feature: Auth & Profile

**Phase 1 — build first, sequentially.** Every other feature depends on the shared infrastructure created here (`requireUserId`, `CoreError`, `toServiceCtx`, demo-user seed).

## Goal

Google OAuth alongside the existing conditional Discord pattern, an app-owned `Profile` (timezone, platforms, goals) with CRUD via core services, a `/settings` page, and a seeded demo user with a valid Better Auth password hash.

## Acceptance criteria

- With `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` set, a "Sign in with Google" button appears and completes OAuth; with them unset, the button is absent and email/password still works. Discord behavior unchanged.
- A signed-in user can open `/settings`, edit timezone / platforms / goals, save, reload, and see persisted values. First visit shows defaults (timezone UTC or browser-detected prefill, empty platforms/goals) without errors.
- `/settings` redirects to `/` when signed out.
- `pnpm db:seed` creates (idempotently) demo user `demo@gamerhealth.dev` / password `demo1234` who can actually sign in through the UI, plus their profile row.
- `pnpm typecheck && pnpm lint && pnpm test` green.

## Shared infrastructure (create here; all later specs assume it)

1. **`packages/core/src/lib/auth.ts`**
   ```ts
   export function requireUserId(ctx: ServiceCtx): string; // throws CoreError("UNAUTHORIZED") when ctx.userId is null
   ```
2. **`packages/core/src/lib/errors.ts`**
   ```ts
   export type CoreErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST";
   export class CoreError extends Error { constructor(public code: CoreErrorCode, message?: string) }
   ```
   Core services throw `CoreError`; never import tRPC in `packages/core`.
3. **`packages/api/src/trpc.ts` additions** (do not restructure the file):
   - `export function toServiceCtx(ctx: { db: typeof db; session: Session | null }): ServiceCtx` → `{ db: ctx.db, userId: ctx.session?.user.id ?? null }`.
   - A middleware applied to `publicProcedure`/`protectedProcedure` (or a try/catch in `toServiceCtx`-using routes — prefer middleware) that maps `CoreError` → `TRPCError` with the matching code (`BAD_REQUEST`, `CONFLICT` → `CONFLICT`, etc.).
   - Router pattern for all features: `protectedProcedure.input(schema).mutation(({ ctx, input }) => coreFn(toServiceCtx(ctx), input))`.
4. **Dependencies:** add `@gamer-health/core` to `packages/api` dependencies (keep package.json deps alphabetical — sherif enforces).
5. Re-export new core modules from `packages/core/src/index.ts`.

## Google OAuth

Follow the existing conditional Discord pattern exactly:

- `packages/auth/env.ts`: add `AUTH_GOOGLE_ID: z.string().min(1).optional()` and `AUTH_GOOGLE_SECRET` (same shape as Discord vars).
- `packages/auth/src/index.ts`: add `googleClientId?` / `googleClientSecret?` to `initAuth` options; build `socialProviders` by conditionally spreading both providers:
  ```ts
  socialProviders: {
    ...(options.discordClientId && options.discordClientSecret ? { discord: { ... } } : {}),
    ...(options.googleClientId && options.googleClientSecret
      ? { google: { clientId, clientSecret, redirectURI: `${options.productionUrl}/api/auth/callback/google` } }
      : {}),
  },
  ```
- `apps/nextjs/src/auth/server.ts`: pass `env.AUTH_GOOGLE_ID` / `env.AUTH_GOOGLE_SECRET`.
- `.env.example`: add the two vars (empty, with a comment linking better-auth Google docs).
- `apps/nextjs/src/app/_components/auth-showcase.tsx`: add a "Sign in with Google" button gated on `Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET)`, identical server-action pattern to the Discord button (`provider: "google"`).

## Core services (`packages/core/src/profile/`)

Table: `Profile` (`packages/db/src/schema.ts`), 1:1 with Better Auth `user`. Input schema `UpsertProfileSchema` is already exported from the db schema.

```ts
// getOrCreateProfile.ts — no input
export async function getOrCreateProfile(ctx: ServiceCtx): Promise<Profile>;
// requireUserId; SELECT by userId; if missing, INSERT defaults
// { timezone: "UTC", platforms: [], goals: null } (onConflictDoNothing + re-select for safety)

// updateProfile.ts
export const updateProfileInput = UpsertProfileSchema; // from @gamer-health/db/schema
export async function updateProfile(ctx: ServiceCtx, input): Promise<Profile>;
// upsert (insert … onConflictDoUpdate on userId), returns the row
```

Validate `timezone` is a real IANA zone: reject values not in `Intl.supportedValuesOf("timeZone")` with `CoreError("BAD_REQUEST")`.

## tRPC routes (`packages/api/src/router/profile.ts`, mounted as `profile` in `root.ts`)

- `get`: protected query → `getOrCreateProfile`
- `update`: protected mutation, input `UpsertProfileSchema` → `updateProfile`

## UI surfaces

- **`/settings` page** (`apps/nextjs/src/app/settings/page.tsx`): server component checks session (redirect `/` if none), renders a client form:
  - Timezone: searchable `<select>` fed by `Intl.supportedValuesOf("timeZone")`; if profile timezone is the default `"UTC"` and untouched, prefill with `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - Platforms: toggleable chips from the constant list `["PC", "PlayStation", "Xbox", "Switch", "Mobile", "Other"]` (constant in `packages/validators`, e.g. `GAMING_PLATFORMS`).
  - Goals: textarea (max 1000 chars).
  - Save via `profile.update`; show success state; use existing `@gamer-health/ui` components.
- Add a "Settings" link to the signed-in state of the home page (or nav header if one exists by then).

## Seed additions (`packages/db/src/seed.ts`)

Replace the demo-user TODO:

- Add `better-auth` to `packages/db` **devDependencies** (importing `@gamer-health/auth` would create a workspace cycle — auth depends on db).
- In `seed.ts`, construct a minimal local instance:
  ```ts
  const auth = betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    secret: process.env.AUTH_SECRET ?? "seed-secret",
    baseURL: "http://localhost:3000",
    emailAndPassword: { enabled: true },
  });
  ```
- Export constants used by later seed sections: `export const DEMO_EMAIL = "demo@gamerhealth.dev";` (name "Demo Gamer", password `demo1234`).
- Idempotency: look up `user` by email first; only call `auth.api.signUpEmail({ body: { email, password, name } })` when absent. Then upsert the profile row: timezone `America/Chicago`, platforms `["PC", "Switch"]`, goals `"Game hard, stay healthy."`.
- Later feature sections resolve the demo user id by selecting on `DEMO_EMAIL` — keep this section first.

## Non-goals

- No password reset, email verification, account linking/unlinking UI, avatar upload, or account deletion.
- No timezone-change migration of historical streaks/prompts (future days simply use the new zone).
- Do not modify `packages/db/src/auth-schema.ts` (generated by Better Auth).

## Dependencies / emits

- Emits no reward events.
- Provides to everyone: `requireUserId`, `CoreError`, `toServiceCtx`, `getOrCreateProfile` (used for timezone by habit-engine, gamification, dashboard), the seeded demo user.
