# Gamer Health

A wellness app for gamers: log gaming sessions, get healthy-habit nudges (breaks,
hydration, stretching, sleep), quick mood check-ins, and earn XP/streaks for
healthy behavior — with a dashboard correlating playtime and wellbeing.

Built as a Turborepo + pnpm TypeScript monorepo (Next.js, tRPC, Drizzle,
Better Auth, Tailwind). Scaffolded from [create-t3-turbo](https://github.com/t3-oss/create-t3-turbo).

- Product plan and feature phases: [docs/PLAN.md](docs/PLAN.md)
- Conventions, commands, and agent workflow: [CLAUDE.md](CLAUDE.md)

## Quick start

```bash
pnpm install
cp .env.example .env          # then set a real AUTH_SECRET
docker compose up -d db       # Postgres 16 on localhost:55432
pnpm -F @gamer-health/db push # apply schema
pnpm db:seed                  # deterministic demo data
pnpm dev:next                 # http://localhost:3000
```

## Workspace layout

| Path | What it is |
|---|---|
| `apps/nextjs` | Next.js App Router web app |
| `packages/api` | tRPC v11 routers (thin wrappers) |
| `packages/core` | Domain services — all business logic lives here |
| `packages/db` | Drizzle schema, migrations, seed |
| `packages/auth` | Better Auth configuration |
| `packages/ui` | Shared UI components |
| `packages/validators` | Shared Zod schemas |
| `tooling/*` | eslint / prettier / tsconfig / tailwind presets |

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test
```
