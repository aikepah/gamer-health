# Gamer Health — MVP Plan & Agentic Development Setup

## Context

Greenfield project in `~/projects/gamer-health` (currently empty, not yet a git repo). The product is a wellness app for gamers combining four pillars the user selected: **healthy habits around gaming sessions, fitness/health gamification, session analytics, and mental health & balance**. Target: web app now, mobile (likely Expo/React Native) in the near future.

Two deliverables from this plan:
1. A scoped MVP with a tech stack chosen for agent-friendly development.
2. A Claude Code agent setup (`.claude/agents/`, `CLAUDE.md`, skills) where **Sonnet does most implementation work and Fable 5 is pulled in automatically for architecture, escalations, and review** — plus an architecture that keeps the door open for a post-MVP in-app AI chat that can operate the app via tools.

---

## Product: MVP scope

The four pillars connect into one loop, so the MVP takes a thin slice of each:

> **Log a gaming session → get healthy-habit nudges during/around it → quick mood/body check-ins → earn XP/streaks for healthy behavior → see playtime-vs-wellness trends on a dashboard.**

**In MVP:**
- **Auth & profile** — email/password + Google OAuth, basic profile (timezone, gaming platforms, goals).
- **Session tracking (manual)** — start/stop a session timer or log one retroactively; pick game from a simple catalog (free-text + autocomplete seeded list). Steam API sync is post-MVP; the schema should anticipate it (`source: manual | steam | ...`).
- **Habit engine** — a set of built-in habits (take a break every 50 min, hydrate, stretch, posture check, no gaming within 1h of bedtime, daily movement). Users toggle/configure them; the app generates habit "prompts" tied to active sessions and to the daily schedule; users mark them done/skipped. In-browser notifications for reminders during an active session.
- **Check-ins** — 10-second entries: mood (1–5), energy, sleep quality, optional note. Prompted after sessions and once daily.
- **Gamification** — XP for completed habits/check-ins, levels, daily streaks, a handful of achievements ("7-day hydration streak", "Logged 10 sessions"). Design as a generic event→reward engine so quests can be added later.
- **Dashboard** — weekly playtime, habit completion rate, mood/energy trend, playtime-vs-mood correlation view, streak/level summary.

**Explicitly post-MVP:** Steam/console API integration, push notifications/PWA, social/friends, the in-app AI chat, the Expo mobile app, desktop companion (game detection/overlays).

---

## Tech stack

**Recommendation: full-stack TypeScript monorepo** rather than Rails + JS frontend. Rationale:
- One language end-to-end means agents (and typecheck as their feedback loop) catch integration errors across the whole stack; shared types between API, web, and future mobile eliminate the largest class of agent mistakes.
- The mobile app reuses the same tRPC client, auth, and validation packages.
- The future AI chat needs a typed "tool layer" — Zod schemas written once serve as API validation *and* Claude tool `input_schema`s.

**Stack (based on the `create-t3-turbo` template, which ships exactly this shape):**
- **Monorepo:** Turborepo + pnpm workspaces
- **Web:** Next.js (App Router) + React + Tailwind CSS + shadcn/ui
- **API:** tRPC v11 (typesafe RPC; consumable from Next.js now, Expo later)
- **DB:** PostgreSQL (Docker locally; Neon or Supabase in prod) + **Drizzle ORM**
- **Auth:** **Better Auth** (works across Next.js and Expo)
- **Validation:** Zod everywhere (tRPC inputs, forms, future AI tools)
- **Charts:** Recharts (dashboard)
- **Testing:** Vitest (unit), Playwright (e2e smoke), `tsc --noEmit` + ESLint as fast agent feedback
- **Later:** `apps/mobile` (Expo) drops into the same monorepo; `@anthropic-ai/sdk` for the in-app chat

**Monorepo layout:**
```
apps/
  web/            # Next.js app (UI + tRPC handler)
apps/mobile/      # (post-MVP, Expo)
packages/
  api/            # tRPC routers — thin, call into core/
  core/           # ← domain services: the "tool layer" (see below)
  db/             # Drizzle schema + migrations + seed
  auth/           # Better Auth config
  ui/             # shared components
  validators/     # Zod schemas shared by api/core/web/mobile/AI-tools
tooling/          # eslint, tsconfig, tailwind presets
```

### The tool-first service layer (key architectural decision)

Even though the AI chat is post-MVP, every domain action is built from day one as a **plain, typed service function** in `packages/core`, with its Zod input schema in `packages/validators`:

```ts
// packages/core/src/sessions/logSession.ts
export const logSessionInput = z.object({ gameId: z.string(), startedAt: ..., endedAt: ... });
export async function logSession(ctx: ServiceCtx, input: LogSessionInput) { ... }
```

- tRPC routers are one-liners wrapping these functions (`protectedProcedure.input(logSessionInput).mutation(...)`).
- Post-MVP, the AI chat exposes the *same* functions as Claude tools via the SDK's tool runner (`client.beta.messages.toolRunner` + `betaZodTool`, model `claude-opus-4-8`, streaming) — no dedicated UI needed for an action to be reachable ("log yesterday's 3-hour Elden Ring session and skip today's stretch reminder").
- Rule enforced in CLAUDE.md: **no business logic in React components or tRPC routers** — logic lives in `core`, so it's automatically AI-operable later.

---

## Agentic development setup

### Model strategy: Sonnet by default, Fable 5 on demand

Claude Code subagents (`.claude/agents/*.md`) carry a `model:` in their frontmatter, so model routing is automatic based on *which agent is invoked*, and the escalation policy in CLAUDE.md tells the orchestrator when to reach for the Fable-backed agents:

| Agent file | Model | Role |
|---|---|---|
| `feature-builder.md` | `sonnet` | Implements one scoped feature end-to-end (schema → core service → tRPC → UI → tests); runs typecheck/lint/tests before finishing |
| `test-hardener.md` | `sonnet` | Adds/extends Vitest + Playwright coverage for existing code |
| `architect.md` | `fable` (inherit) | Designs DB schema, cross-cutting contracts, and feature specs before builders run; resolves conflicts between parallel workstreams |
| `debugger.md` | `fable` | Escalation target: gets the full failure context when a builder is stuck |

**Escalation rules (written into CLAUDE.md so the orchestrating session applies them automatically):**
1. Default all implementation delegation to `feature-builder` (Sonnet).
2. Escalate to `architect`/`debugger` (Fable 5) when: the task changes DB schema shared by multiple features, touches auth/security, spans 3+ packages, or a Sonnet agent has failed the same task twice.
3. Code review: use built-in `/code-review` after each feature lands (the user can run `/code-review ultra` for the multi-agent cloud review on bigger merges).

### Feature orchestration workflow

Once scaffolding is done, features are built as parallel, isolated units:

1. `architect` produces/refines a feature spec (acceptance criteria + files/contracts) from the backlog below; specs live in `docs/features/*.md`.
2. Orchestrating session spawns `feature-builder` agents — **one per independent feature, in `worktree` isolation** — so parallel features can't clobber each other. Dependent features (e.g., gamification depends on habit events) run sequentially.
3. Each builder must finish with `pnpm typecheck && pnpm lint && pnpm test` green and a short verification note; the orchestrator runs `/verify` (drives the real app) before merging a worktree.
4. `/code-review` on the diff; fixes applied; merge.

### Repo-level agent support (built during scaffolding)

- **`CLAUDE.md`** — stack conventions, the tool-first rule, escalation policy, command reference (`pnpm dev`, `pnpm db:push`, `pnpm test`), "definition of done" for features.
- **`.claude/agents/`** — the four agent definitions above.
- **Project verify skill** (`.claude/skills/verify/`) — how to boot Postgres (docker compose), seed, run dev server, and smoke-test the core loop; the built-in `/verify` bootstraps this on first use.
- **Seed script** — deterministic demo user + sessions + habits so agents can verify UI states without manual setup.
- **`.claude/settings.json`** — allowlist for common commands (`pnpm *`, `docker compose *`) to reduce permission prompts.

---

## Implementation phases

**Phase 0 — Scaffold (single session, Fable-level attention):**
`git init`; scaffold from `create-t3-turbo`; swap in Better Auth if the template variant doesn't include it; add `packages/core`; docker-compose Postgres; CI (GitHub Actions: typecheck/lint/test); write CLAUDE.md, agent definitions, verify skill, seed script. Verify: `pnpm dev` boots, sign-up works.

**Phase 1 — Foundation (sequential):**
1. Auth + profile (Better Auth, profile table, settings page)
2. DB schema for the whole MVP (architect-designed once: `games`, `sessions`, `habits`, `habit_prompts`, `checkins`, `reward_events`, `achievements`, `streaks`) — one coherent design beats per-feature schema drift

**Phase 2 — Parallel feature build (worktree-isolated Sonnet builders):**
3. Session tracking (timer + retro logging + game catalog)
4. Habit engine (config UI, prompt generation, in-session reminders)
5. Check-ins (post-session + daily flows)

**Phase 3 — Depends on Phase 2 events:**
6. Gamification engine (consumes habit/check-in/session events → XP, streaks, achievements)
7. Dashboard (charts over sessions/habits/check-ins/streaks)

**Phase 4 — Polish & ship:** empty states, onboarding flow, Playwright smoke suite, deploy (Vercel + Neon).

**Post-MVP backlog (recorded, not built):** Steam sync, PWA/push notifications, AI chat (tool runner over `packages/core`), Expo app, quests/social.

---

## MVP 2 — Roles & Coaching

Tracked as GitHub issues #4–#15 under milestone "MVP 2: Roles & Coaching"
(issues are the requirements source of truth; specs in `docs/features/`
reference them). **Delivery model: one PR per issue, branch per issue**,
merged in dependency order; `/code-review` before each merge.

**Wave 1 — foundation & admin (specs written, schema landed):**

| Order | Issue | Spec | Notes |
|---|---|---|---|
| 1 | #4 roles & authorization | `roles-authorization.md` | Builds first; blocks everything. `assertCoachOf` ships deny-all until #11. |
| 2 (parallel) | #5 admin user management | `admin-users.md` | Owns the shared `recordAdminAudit` helper. |
| 2 (parallel) | #6 coach invitations | `admin-invitations.md` | Parallel-safe with #5/#8 in worktrees. |
| 2 (parallel) | #8 habit generalization | `habit-generalization.md` | Migration-heavy; nothing habit-related in parallel. Destructive step scripted in-spec. |
| 3 | #7 admin content management | `admin-content.md` | After #8 (habit definitions) and #5 (audit helper, seeded players). |

Wave-1 schema is already in `packages/db/src/schema.ts`: `profile.role` +
`profile.deactivatedAt`, `admin_audit_log`, `coach_invite`,
`habit_definition`, transitional `habit.definition_id` /
`habit.assigned_by_user_id` (finalized destructively by #8's PR per its
spec), backfill script in `packages/db/src/migrations/`.

**Wave 2 — coaching (specs written, schema landed):**

| Order | Issue | Spec | Notes |
|---|---|---|---|
| 1 | #9 coach profiles | `coach-profiles.md` | Owns the `coaching` tRPC router skeleton and the `mergeGames`/`deleteGame` `coach_game` fix. |
| 2 | #10 discovery & application | `coach-discovery.md` | No new tables. Produces `applied` relationships. |
| 3 | #11 relationships & roster | `coaching-relationships.md` | **Keystone** — replaces the deny-all body of `assertCoachOf`. Nothing after it works until it merges. |
| 4 (parallel) | #12 player tracking | `coach-player-tracking.md` | Also needs #8. Refactors 4 core services to explicit-userId inner functions. |
| 4 (parallel) | #13 goals | `goals.md` | |
| 4 (parallel) | #14 habit assignment | `coach-habit-assignment.md` | Also needs #8. Needs **no new habit schema** — one index only. |
| 4 (parallel) | #15 scheduling | `coaching-sessions.md` | Also needs #9. Extends #11's `endCoachingRelationship`. |

Dependency graph: `#9 → #10 → #11 → {#12, #13, #14, #15}`. Steps 1–3 are
strictly sequential (each consumes the previous one's rows). The four
step-4 issues are **parallel-safe in worktrees** once #11 is on `main`: they
touch disjoint core directories, add one key each to
`packages/api/src/router/coaching/index.ts`, and own separate route groups.
Three coordination points are called out in the specs — the shared
`/coach/players/[playerUserId]` page (#12/#13/#14: first to land creates it,
others add a panel), the habit-completion aggregate (#12/#14: first to land
owns `queryHabitCompletionRaw`), and #15's edit to `endCoachingRelationship`.

**Delivery: one PR per issue, branch per issue**, `/code-review` before each
merge, close the issue on merge with the commit and what was verified.

Wave-2 schema is already in `packages/db/src/schema.ts` (purely additive — no
data migration): `coach_profile`, `coach_game`, `coach_availability`,
`coaching_relationship`, `goal`, `coaching_session`; enums
`coaching_relationship_status`, `coaching_session_status`, `goal_status` (built
from `packages/validators/src/coaching.ts`); plus
`habit_definition_created_by_idx` for #14.

Payments/subscriptions stay out of scope. The single insertion point is
`acceptCoachApplication` (#11) — the only writer of `status = 'active'`.

---

## Verification

- Per-feature: builder agents finish with `pnpm typecheck && pnpm lint && pnpm test` green; orchestrator runs `/verify` to drive the actual flow (e.g., log a session → habit prompt appears → complete it → XP increments → dashboard reflects it).
- Seeded demo user makes every UI state reachable deterministically.
- CI runs typecheck/lint/unit on every push; Playwright smoke on main.
- End-to-end MVP acceptance: a new user can sign up, log a session, complete a break/hydration prompt, check in mood, see XP + streak, and view the weekly dashboard.
