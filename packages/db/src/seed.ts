/**
 * Deterministic seed for local dev and agent verification.
 *
 * Run with: pnpm db:seed (from the repo root; Postgres must be up).
 *
 * Each feature adds its own section below so every UI state is reachable
 * without manual setup. Keep inserts idempotent (delete-then-insert or
 * onConflictDoNothing) so the script can be re-run safely.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";

import { db } from "./client";
import { Game, GameSession, Post, Profile, user } from "./schema";

export const DEMO_EMAIL = "demo@gamerhealth.dev";
const DEMO_PASSWORD = "demo1234";
const DEMO_NAME = "Demo Gamer";

// Minimal local Better Auth instance for seeding only. We can't import
// @gamer-health/auth here: it depends on @gamer-health/db, so importing it
// from this package would create a workspace cycle.
const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env.AUTH_SECRET ?? "seed-secret",
  baseURL: "http://localhost:3000",
  emailAndPassword: { enabled: true },
});

async function seedDemoUser() {
  const existing = await db.query.user.findFirst({
    where: eq(user.email, DEMO_EMAIL),
  });

  const demoUser =
    existing ??
    (
      await auth.api.signUpEmail({
        body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: DEMO_NAME },
      })
    ).user;

  const demoProfile = {
    timezone: "America/Chicago",
    platforms: ["PC", "Switch"],
    goals: "Game hard, stay healthy.",
  };
  await db
    .insert(Profile)
    .values({ userId: demoUser.id, ...demoProfile })
    .onConflictDoUpdate({
      target: Profile.userId,
      set: demoProfile,
    });

  return demoUser;
}

// --- Session tracking: catalog + demo user's session history --------------

const CATALOG_GAMES = [
  { name: "Elden Ring", platform: "PC" },
  { name: "Baldur's Gate 3", platform: "PC" },
  { name: "Hades II", platform: "PC" },
  { name: "Stardew Valley", platform: "Switch" },
  { name: "Fortnite", platform: "PC" },
  { name: "League of Legends", platform: "PC" },
  { name: "Minecraft", platform: "PC" },
  { name: "Zelda: Tears of the Kingdom", platform: "Switch" },
  { name: "Rocket League", platform: "PC" },
  { name: "Cyberpunk 2077", platform: "PC" },
] as const;

interface SeedSession {
  game: (typeof CATALOG_GAMES)[number]["name"];
  /** Whole days before "now" the session started. */
  daysAgo: number;
  /** Local (America/Chicago) start hour/minute. */
  startHour: number;
  startMinute?: number;
  durationMinutes: number;
  notes?: string;
}

// 8-10 completed sessions over the last 14 days, varied games/durations, a
// couple with notes, and one ending after 23:00 local for dashboard interest.
const DEMO_SESSIONS: SeedSession[] = [
  { game: "Elden Ring", daysAgo: 13, startHour: 14, durationMinutes: 90 },
  { game: "Fortnite", daysAgo: 12, startHour: 19, durationMinutes: 45 },
  {
    game: "League of Legends",
    daysAgo: 11,
    startHour: 20,
    durationMinutes: 60,
    notes: "Ranked grind, went 3-2.",
  },
  { game: "Minecraft", daysAgo: 10, startHour: 16, durationMinutes: 120 },
  { game: "Stardew Valley", daysAgo: 8, startHour: 10, durationMinutes: 75 },
  {
    game: "Hades II",
    daysAgo: 6,
    startHour: 21,
    durationMinutes: 150,
    notes: "Almost beat the final boss!",
  },
  { game: "Rocket League", daysAgo: 4, startHour: 18, durationMinutes: 45 },
  // Starts 21:00, +150min -> ends 23:30 local.
  { game: "Cyberpunk 2077", daysAgo: 2, startHour: 21, durationMinutes: 150 },
  {
    game: "Baldur's Gate 3",
    daysAgo: 1,
    startHour: 13,
    durationMinutes: 180,
    notes: "Full campaign session with the squad.",
  },
];

/**
 * Fixed CDT (UTC-5) offset used only to give seed data demo-plausible local
 * times (e.g. the late-night Cyberpunk session). Not a general timezone
 * conversion — the app's local-day logic lives in core (see habit-engine).
 */
const CHICAGO_UTC_OFFSET_HOURS = 5;

function chicagoLocal(daysAgo: number, localHour: number, localMinute = 0) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(localHour + CHICAGO_UTC_OFFSET_HOURS, localMinute, 0, 0);
  return d;
}

async function seedSessionTracking(demoUserId: string) {
  await db
    .insert(Game)
    .values([...CATALOG_GAMES])
    .onConflictDoNothing();

  const games = await db.query.Game.findMany();
  const gameIdByName = new Map(games.map((g) => [g.name, g.id]));
  function gameId(name: string): string {
    const id = gameIdByName.get(name);
    if (!id) {
      throw new Error(`Seed game not found in catalog: ${name}`);
    }
    return id;
  }

  // Idempotency: wipe the demo user's sessions and re-insert deterministically.
  await db.delete(GameSession).where(eq(GameSession.userId, demoUserId));

  await db.insert(GameSession).values(
    DEMO_SESSIONS.map((s) => {
      const startedAt = chicagoLocal(
        s.daysAgo,
        s.startHour,
        s.startMinute ?? 0,
      );
      const endedAt = new Date(
        startedAt.getTime() + s.durationMinutes * 60_000,
      );
      return {
        userId: demoUserId,
        gameId: gameId(s.game),
        startedAt,
        endedAt,
        source: "manual" as const,
        notes: s.notes ?? null,
      };
    }),
  );
}

async function seed() {
  // --- Demo posts (template placeholder; remove with the posts feature) ---
  await db.delete(Post);
  await db.insert(Post).values([
    { title: "Welcome to Gamer Health", content: "Seeded post #1" },
    { title: "Log your first session", content: "Seeded post #2" },
  ]);

  // --- Phase 1: demo user (via Better Auth API) + profile. Later feature
  // sections resolve the demo user id by selecting on DEMO_EMAIL. ---
  const demoUser = await seedDemoUser();

  // --- Session tracking: catalog + demo user's session history ---
  await seedSessionTracking(demoUser.id);

  console.log("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
