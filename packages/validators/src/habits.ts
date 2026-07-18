/**
 * Habit catalog source of truth (#8, docs/features/habit-generalization.md).
 * `packages/db`'s seed and the one-time backfill migration
 * (packages/db/src/migrations/0001-habit-definition-backfill.ts) both upsert
 * `habit_definition` rows from `BUILT_IN_HABIT_DEFINITIONS` by slug. Core
 * never reads this constant at runtime — it always queries the DB — so this
 * lives here purely as the single place built-in habit data is authored.
 */

/**
 * How prompts for a habit are generated. Mirrors the `habit_trigger_type` pg
 * enum in @gamer-health/db (packages/db/src/schema.ts) — the two must be kept
 * in sync by hand since validators can't import from db (db already depends
 * on validators; a reverse import would create a workspace cycle).
 */
export const HABIT_TRIGGER_TYPES = [
  "session_interval",
  "daily_schedule",
  "bedtime_cutoff",
] as const;
export type HabitTriggerType = (typeof HABIT_TRIGGER_TYPES)[number];

/**
 * Per-trigger-type config, stored as jsonb on `habit`/`habit_definition`.
 * Mirrors `HabitConfig` in @gamer-health/db (packages/db/src/schema.ts) for
 * the same reason as `HabitTriggerType` above.
 */
export interface HabitConfig {
  /** session_interval: prompt every N minutes of active session. */
  intervalMinutes?: number;
  /** daily_schedule: local time "HH:MM" the daily prompt is due. */
  timeOfDay?: string;
  /** bedtime_cutoff: local bedtime "HH:MM". */
  bedtime?: string;
  /** bedtime_cutoff: prompt fires this many minutes before bedtime. */
  leadMinutes?: number;
}

export interface BuiltInHabitDefinition {
  /** Stable code-facing key; matches habit_definition.slug. */
  slug: string;
  title: string;
  description: string;
  /** Shown on generated prompts. */
  promptText: string;
  triggerType: HabitTriggerType;
  defaultConfig: HabitConfig;
}

/**
 * Fixed catalog of built-in habits. Adding one is a code change here plus a
 * re-run of the seed (or, on already-migrated DBs, nothing further — seed
 * upserts by slug).
 */
export const BUILT_IN_HABIT_DEFINITIONS: BuiltInHabitDefinition[] = [
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
];
