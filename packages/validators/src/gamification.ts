import { z } from "zod/v4";

/** Reward event taxonomy — single source of truth for XP amounts. */
export const REWARD_EVENT_DEFS = {
  /** Emitted by session-tracking when a session gets an endedAt (stop or retro log). */
  session_logged: { xp: 10, sourceKind: "game_session" },
  /** Emitted by habit-engine when a prompt is marked done. */
  habit_prompt_completed: { xp: 15, sourceKind: "habit_prompt" },
  /** Emitted by checkins on every created check-in. */
  checkin_completed: { xp: 10, sourceKind: "checkin" },
  /** Emitted by the gamification engine itself; xp comes from ACHIEVEMENT_DEFS. */
  achievement_unlocked: { xp: 0, sourceKind: "achievement" },
} as const;

export type RewardEventType = keyof typeof REWARD_EVENT_DEFS;

export const rewardEventTypeSchema = z.enum(
  Object.keys(REWARD_EVENT_DEFS) as [RewardEventType, ...RewardEventType[]],
);

export const STREAK_KINDS = [
  "daily_checkin",
  "daily_habit",
  "habit_hydrate",
] as const;
export type StreakKind = (typeof STREAK_KINDS)[number];

/** Achievement metadata. Unlock criteria live in @gamer-health/core. */
export const ACHIEVEMENT_DEFS = {
  first_session: {
    title: "First Quest",
    description: "Log your first gaming session",
    xp: 25,
  },
  sessions_10: {
    title: "Dedicated Player",
    description: "Log 10 gaming sessions",
    xp: 50,
  },
  first_checkin: {
    title: "Self-Aware",
    description: "Complete your first check-in",
    xp: 25,
  },
  checkin_streak_7: {
    title: "Week of Wellness",
    description: "Check in 7 days in a row",
    xp: 100,
  },
  hydration_streak_7: {
    title: "Hydration Hero",
    description: "Complete the hydrate habit 7 days in a row",
    xp: 100,
  },
  habit_prompts_25: {
    title: "Habit Machine",
    description: "Complete 25 habit prompts",
    xp: 75,
  },
} as const;
export type AchievementKey = keyof typeof ACHIEVEMENT_DEFS;
