/**
 * MVP 2 #8 — habit generalization, step 1 of 2 (NON-destructive, idempotent).
 *
 * Inserts the six built-in habit definitions (upsert by slug) and backfills
 * `habit.definition_id` from the legacy `habit.kind` enum column. Safe to
 * re-run at any time; required immediately before the destructive step 2
 * (dropping habit.kind/trigger_type — see
 * docs/features/habit-generalization.md §Migration), because re-seeding
 * during the migration window re-creates habit rows with NULL definition_id.
 *
 * Run with (repo root):
 *   pnpm -F @gamer-health/db with-env tsx src/migrations/0001-habit-definition-backfill.ts
 *
 * The definition data below intentionally mirrors HABIT_DEFINITIONS in
 * packages/core/src/habits/definitions.ts (which #8 relocates to
 * @gamer-health/validators as BUILT_IN_HABIT_DEFINITIONS — that constant and
 * this list must stay identical; seed.ts upserts from the validators copy).
 * One deliberate difference: bedtime_cutoff's triggerType becomes the new
 * dedicated "bedtime_cutoff" trigger (was "daily_schedule" + special-casing).
 */
import { sql } from "drizzle-orm";

import { db } from "../client";
import { HabitDefinition } from "../schema";

const BUILT_IN_DEFINITIONS = [
  {
    slug: "break_interval",
    title: "Break Reminder",
    description:
      "Regular breaks during long sessions reduce eye strain and fatigue.",
    promptText: "Take a 5-minute break",
    triggerType: "session_interval",
    defaultConfig: { intervalMinutes: 50 },
  },
  {
    slug: "hydrate",
    title: "Hydration Reminder",
    description: "Stay hydrated while gaming to keep your energy and focus up.",
    promptText: "Drink some water",
    triggerType: "session_interval",
    defaultConfig: { intervalMinutes: 30 },
  },
  {
    slug: "stretch",
    title: "Stretch Reminder",
    description:
      "Standing and stretching keeps your body loose during long sessions.",
    promptText: "Stand up and stretch",
    triggerType: "session_interval",
    defaultConfig: { intervalMinutes: 60 },
  },
  {
    slug: "posture",
    title: "Posture Check",
    description: "A quick posture check helps avoid strain from long sessions.",
    promptText: "Posture check",
    triggerType: "session_interval",
    defaultConfig: { intervalMinutes: 45 },
  },
  {
    slug: "bedtime_cutoff",
    title: "Bedtime Cutoff",
    description: "A heads-up to wind down before bed for better sleep quality.",
    promptText: "Start winding down — bedtime soon",
    triggerType: "bedtime_cutoff",
    defaultConfig: { bedtime: "23:00", leadMinutes: 60 },
  },
  {
    slug: "daily_movement",
    title: "Daily Movement",
    description: "A daily nudge to get moving and balance out gaming time.",
    promptText: "Get 20 minutes of movement",
    triggerType: "daily_schedule",
    defaultConfig: { timeOfDay: "17:00" },
  },
] as const;

async function run() {
  await db
    .insert(HabitDefinition)
    .values(
      BUILT_IN_DEFINITIONS.map((d) => ({
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
