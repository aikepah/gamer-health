/**
 * Deterministic seed for local dev and agent verification.
 *
 * Run with: pnpm db:seed (from the repo root; Postgres must be up).
 *
 * Each feature adds its own section below so every UI state is reachable
 * without manual setup. Keep inserts idempotent (delete-then-insert or
 * onConflictDoNothing) so the script can be re-run safely.
 */
import { db } from "./client";
import { Post } from "./schema";

async function seed() {
  // --- Demo posts (template placeholder; remove with the posts feature) ---
  await db.delete(Post);
  await db.insert(Post).values([
    { title: "Welcome to Gamer Health", content: "Seeded post #1" },
    { title: "Log your first session", content: "Seeded post #2" },
  ]);

  // --- Phase 1+: demo user (via Better Auth API), games catalog, sessions,
  // habits, check-ins are added here by their respective features. ---

  console.log("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
