# Gamer Health

Wellness app for gamers: log gaming sessions, get healthy-habit nudges, quick mood
check-ins, earn XP/streaks, and see playtime-vs-wellness trends. Web now (Next.js),
Expo mobile later. MVP plan and feature phases: `docs/PLAN.md`.

## Stack

Turborepo + pnpm monorepo (based on create-t3-turbo):

- `apps/nextjs` — Next.js App Router, React 19, Tailwind v4, shadcn/ui-style components from `@gamer-health/ui`
- `packages/api` — tRPC v11 routers (thin wrappers only)
- `packages/core` — **domain services: all business logic lives here** (see below)
- `packages/db` — Drizzle ORM + Postgres, schema in `src/schema.ts`, seed in `src/seed.ts`
- `packages/auth` — Better Auth config
- `packages/validators` — shared Zod schemas
- `tooling/*` — eslint/prettier/tsconfig/tailwind presets

## Commands

```bash
docker compose up -d db          # Postgres 16 on localhost:55432 (NOT 5432/5433 — those are taken on this machine)
pnpm dev:next                    # dev server (Next.js only)
pnpm -F @gamer-health/db push    # push schema (don't use `pnpm db:push`; turbo marks it interactive)
pnpm db:seed                     # deterministic seed (idempotent — safe to re-run)
pnpm typecheck && pnpm lint      # fast feedback; run before finishing any task
pnpm format:fix && pnpm lint:fix # auto-fix style issues
```

Env lives in root `.env` (copy from `.env.example`). `packages/db` scripts load it
via `pnpm with-env`.

## Architecture rule: tool-first service layer

**Every domain action is a plain typed function in `packages/core`**, shape
`(ctx: ServiceCtx, input: Input) => Promise<Output>`, with its Zod input schema
exported alongside it (or from `@gamer-health/validators`).

- tRPC routers in `packages/api` are one-liners: `protectedProcedure.input(schema).mutation(({ctx, input}) => coreFn(ctx, input))`.
- **No business logic in React components, tRPC routers, or route handlers.**
- Why: a post-MVP in-app AI assistant will expose these same functions as Claude
  tools (Zod schema → tool `input_schema`). Logic outside `core` is invisible to it.
- Gamification is event-driven: features emit reward events; the gamification
  engine consumes them. Don't hand-award XP from feature code.

## Conventions

- Zod v4 (`import { z } from "zod/v4"` in db package; plain `zod` elsewhere per existing imports — match the file you're in).
- Drizzle schema uses `casing: "snake_case"` — write camelCase in TS, it maps to snake_case columns.
- Dependencies in package.json must be **alphabetically ordered** (sherif enforces this on `pnpm install`; run `pnpm dlx sherif@latest -f` to autofix).
- Keep `packages/db/src/seed.ts` updated with every feature so all UI states are reachable from a fresh seed.
- Never commit `.env`.

## Definition of done (for any feature task)

1. Logic in `packages/core` + schema in validators/db as appropriate
2. tRPC route wired, UI implemented, seed extended
3. `pnpm typecheck && pnpm lint && pnpm test` all green
4. Verified against the running app (seeded data, real flow), not just tests
5. Short note in the task/PR: what was verified and how

## Agent workflow & model escalation

Subagents live in `.claude/agents/`. Default routing:

| Agent | Model | Use for |
|---|---|---|
| `feature-builder` | Sonnet | Implementing one scoped feature end-to-end |
| `test-hardener` | Sonnet | Adding/extending Vitest + Playwright coverage |
| `architect` | Opus | Schema design, cross-cutting contracts, feature specs (`docs/features/*.md`) |
| `debugger` | Opus | Escalation when a builder is stuck |

**Phase workflow (in order — issues come first):**

1. **Issues first**: break the phase into GitHub issues (`gh issue create`,
   one per feature-builder-sized work item, dependencies noted in the body,
   grouped under a milestone) and get them approved by the user.
2. **Architecture second**: the `architect` designs schema + specs FROM the
   approved issues (specs reference their issue numbers).
3. **Build**: feature-builders implement per spec; close issues on merge with
   a comment noting the commit and what was verified.

**Escalation rules (apply automatically when orchestrating):**

1. Default all implementation delegation to `feature-builder` (Sonnet).
2. Use `architect` **before** builders when a task changes DB schema shared by
   multiple features, touches auth/security, or spans 3+ packages.
3. If a Sonnet agent fails the same task twice, hand the full failure context to
   `debugger` (Opus) instead of retrying a third time.
4. Parallel feature builds run in **worktree isolation** (one builder per
   independent feature); dependent features run sequentially.
5. After a feature lands: run `/code-review` on the diff before merging.
