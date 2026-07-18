/**
 * MVP 2 #8 — habit generalization, step 1 of 2 (NON-destructive, idempotent).
 *
 * Inserts the six built-in habit definitions (upsert by slug, from
 * @gamer-health/validators' BUILT_IN_HABIT_DEFINITIONS — the single source of
 * truth for built-in habit data; seed.ts upserts from the same constant) and
 * backfills `habit.definition_id` from the legacy `habit.kind` enum column.
 * Safe to re-run at any time; required immediately before the destructive
 * step 2 (dropping habit.kind/trigger_type — see
 * docs/features/habit-generalization.md §Migration), because re-seeding
 * during the migration window re-creates habit rows with NULL definition_id.
 *
 * Run with (repo root):
 *   pnpm -F @gamer-health/db with-env tsx src/migrations/0001-habit-definition-backfill.ts
 *
 * NOTE: this script references `habit.kind` only inside raw SQL (below), so
 * it still typechecks after the #8 column drop — it simply fails at runtime
 * on a post-#8 DB (no `kind` column left to read). It stays in the repo for
 * anyone holding a pre-#8 local DB; fresh databases never need it.
 */
import { sql } from "drizzle-orm";

import { BUILT_IN_HABIT_DEFINITIONS } from "@gamer-health/validators";

import { db } from "../client";
import { HabitDefinition } from "../schema";

async function run() {
  await db
    .insert(HabitDefinition)
    .values(
      BUILT_IN_HABIT_DEFINITIONS.map((d) => ({
        ...d,
        defaultConfig: { ...d.defaultConfig },
        isDefault: true,
        createdByUserId: null,
      })),
    )
    .onConflictDoNothing({ target: HabitDefinition.slug });

  // Legacy kind values equal the built-in slugs by construction.
  const backfilled = await db.execute(sql`
    UPDATE habit
    SET definition_id = hd.id
    FROM habit_definition hd
    WHERE hd.slug = habit.kind::text
      AND habit.definition_id IS NULL
  `);

  const remaining = await db.execute<{ count: string }>(sql`
    SELECT count(*)::text AS count FROM habit WHERE definition_id IS NULL
  `);
  const unlinked = Number(remaining[0]?.count ?? "0");

  console.log(
    `Backfill complete: ${backfilled.count} habit rows linked, ${unlinked} still NULL.`,
  );
  if (unlinked > 0) {
    throw new Error(
      `${unlinked} habit rows have no matching definition — do NOT proceed to the destructive step.`,
    );
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
