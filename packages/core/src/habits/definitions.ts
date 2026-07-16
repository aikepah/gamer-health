import { z } from "zod/v4";

import type { Habit, HabitConfig } from "@gamer-health/db/schema";

/** The built-in habit kinds — matches the `habit_kind` pg enum values. */
export type HabitKind = (typeof Habit)["$inferSelect"]["kind"];

export interface HabitDefinition {
  title: string;
  description: string;
  /** Shown on generated prompts. */
  promptText: string;
  triggerType: "session_interval" | "daily_schedule";
  defaultConfig: HabitConfig;
}

/**
 * Fixed catalog of built-in habits (docs/features/habit-engine.md). Adding a
 * kind is a schema migration (new enum value) plus an entry here.
 */
export const HABIT_DEFINITIONS: Record<HabitKind, HabitDefinition> = {
  break_interval: {
    title: "Break Reminder",
    description:
      "Regular breaks during long sessions reduce eye strain and fatigue.",
    promptText: "Take a 5-minute break",
    triggerType: "session_interval",
    defaultConfig: { intervalMinutes: 50 },
  },
  hydrate: {
    title: "Hydration Reminder",
    description: "Stay hydrated while gaming to keep your energy and focus up.",
    promptText: "Drink some water",
    triggerType: "session_interval",
    defaultConfig: { intervalMinutes: 30 },
  },
  stretch: {
    title: "Stretch Reminder",
    description: "Standing and stretching keeps your body loose during long sessions.",
    promptText: "Stand up and stretch",
    triggerType: "session_interval",
    defaultConfig: { intervalMinutes: 60 },
  },
  posture: {
    title: "Posture Check",
    description: "A quick posture check helps avoid strain from long sessions.",
    promptText: "Posture check",
    triggerType: "session_interval",
    defaultConfig: { intervalMinutes: 45 },
  },
  bedtime_cutoff: {
    title: "Bedtime Cutoff",
    description: "A heads-up to wind down before bed for better sleep quality.",
    promptText: "Start winding down — bedtime soon",
    triggerType: "daily_schedule",
    defaultConfig: { bedtime: "23:00", leadMinutes: 60 },
  },
  daily_movement: {
    title: "Daily Movement",
    description: "A daily nudge to get moving and balance out gaming time.",
    promptText: "Get 20 minutes of movement",
    triggerType: "daily_schedule",
    defaultConfig: { timeOfDay: "17:00" },
  },
};

export const HABIT_KINDS = Object.keys(HABIT_DEFINITIONS) as HabitKind[];

export const habitKindSchema = z.enum(
  HABIT_KINDS as [HabitKind, ...HabitKind[]],
);
