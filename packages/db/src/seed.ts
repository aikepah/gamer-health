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
import { Post, Profile, user } from "./schema";

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

async function seed() {
  // --- Demo posts (template placeholder; remove with the posts feature) ---
  await db.delete(Post);
  await db.insert(Post).values([
    { title: "Welcome to Gamer Health", content: "Seeded post #1" },
    { title: "Log your first session", content: "Seeded post #2" },
  ]);

  // --- Phase 1: demo user (via Better Auth API) + profile. Later feature
  // sections resolve the demo user id by selecting on DEMO_EMAIL. ---
  await seedDemoUser();

  console.log("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
