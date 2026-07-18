# Gamer Health Copilot Instructions

## Commands

Use Node 22+ and pnpm 10.19+.

```bash
pnpm install
cp .env.example .env                    # set AUTH_SECRET
docker compose up -d db                 # Postgres 16 at localhost:55432
pnpm -F @gamer-health/db push           # apply Drizzle schema changes
pnpm db:seed                            # idempotent deterministic demo data
pnpm dev:next                           # Next.js app at http://localhost:3000
```

Run repository checks with:

```bash
pnpm typecheck
pnpm lint
pnpm lint:ws                            # dependency and workspace manifest checks
pnpm format
pnpm test                               # currently runs core Vitest tests
```

Run one core test file or one named test with:

```bash
pnpm --filter @gamer-health/core test -- src/sessions/logSession.test.ts
pnpm --filter @gamer-health/core test -- -t "rejects an active session"
```

Use `pnpm format:fix` and `pnpm lint:fix` for automatic fixes. Do not use the
root `pnpm db:push`: Turbo marks it interactive. Use
`pnpm -F @gamer-health/db push` instead. Database package commands load the
root `.env` through `pnpm with-env`.

## Architecture

This is a pnpm/Turborepo TypeScript monorepo for a gamer wellness app:

- `apps/nextjs` is the Next.js 16 App Router web client. It renders server
  components where possible and uses the tRPC React Query client for interactive
  components. Its `/api/trpc/[trpc]` route adapts requests to the shared API.
- `packages/api` owns tRPC router composition and request/auth context. Routers
  must remain thin adapters: validate input, call a core service with
  `toServiceCtx(ctx)`, and return its result.
- `packages/core` is the domain/tool layer. Every application action is an
  exported typed function with shape
  `(ctx: ServiceCtx, input: Input) => Promise<Output>`. Put business rules,
  authorization-sensitive entity access, and mutations here so tRPC, server
  components, jobs, and a future AI tool caller share identical behavior.
- `packages/db` owns the Drizzle/Postgres schema, generated Better Auth schema,
  client, and seed data. Better Auth owns `auth-schema.ts`; keep app-owned
  profile and product data in `schema.ts`.
- `packages/auth` configures Better Auth. `packages/validators` supplies
  shared Zod contracts and constants, while `packages/ui` holds shared
  shadcn-style UI primitives.

Protected tRPC procedures enforce authentication and reject deactivated
accounts. Use `adminProcedure` and `coachProcedure` for role-gated routes;
admins and coaches are intentionally distinct roles. Core services should
throw `CoreError` for domain failures so the tRPC middleware can translate them
to matching tRPC errors.

Gamification is event-driven. Feature services emit a reward event through
`recordRewardEvent`; that service performs idempotent insertion, streak updates,
and achievement evaluation in a transaction. Do not directly modify XP,
streaks, or achievements from session, habit, or check-in code.

## Repository Conventions

- Export each new core service, input schema, and relevant types from
  `packages/core/src/index.ts`; wire it through a focused router in
  `packages/api/src/router/` and `packages/api/src/root.ts`.
- Keep domain validation schemas beside their core service when specific to one
  operation; place cross-package constants and schemas in
  `@gamer-health/validators`. Use the Zod import style already used by the
  package: `zod/v4` in `packages/db`, and match surrounding files elsewhere.
- Drizzle uses `casing: "snake_case"`: declare camelCase TypeScript properties
  and let Drizzle map them. PostgreSQL enum values are append-only. Update the
  deterministic, idempotent `packages/db/src/seed.ts` with every user-facing
  feature so its UI states can be exercised locally.
- Profiles use IANA time zones; preserve the distinction between an unset
  timezone and explicit `"UTC"`. Use the core date helpers for local-day logic
  such as streaks, schedules, and dashboard aggregation.
- Apply user scoping in core queries and mutations, and use conditional updates
  for state transitions that can race. Existing services use `CoreError`
  (`NOT_FOUND`, `CONFLICT`, `BAD_REQUEST`, etc.) for expected domain failures.
- `package.json` dependencies must be alphabetically ordered. `sherif`
  enforces this; run `pnpm dlx sherif@latest -f` after changing manifests if
  needed.
- Do not edit generated Better Auth schema files manually and never commit
  `.env`.

Feature requirements and implementation contracts live in `docs/features/`;
read the relevant feature spec before changing its domain. The broader product
roadmap is `docs/PLAN.md`.
