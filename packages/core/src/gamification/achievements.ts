import type {
  AchievementKey,
  RewardEventType,
  StreakKind,
} from "@gamer-health/validators";
import { and, count, eq, isNotNull } from "@gamer-health/db";
import {
  Checkin,
  GameSession,
  HabitPrompt,
  RewardEvent,
  UserAchievement,
} from "@gamer-health/db/schema";
import { ACHIEVEMENT_DEFS, REWARD_EVENT_DEFS } from "@gamer-health/validators";

import type { TxDb } from "../ctx";
import type { StreakState } from "./streaks";

/** Which achievements a given event type can trigger (never recursive). */
const ACHIEVEMENT_CANDIDATES: Partial<
  Record<RewardEventType, AchievementKey[]>
> = {
  session_logged: ["first_session", "sessions_10"],
  checkin_completed: ["first_checkin", "checkin_streak_7"],
  habit_prompt_completed: ["habit_prompts_25", "hydration_streak_7"],
};

async function isSatisfied(
  tx: TxDb,
  userId: string,
  key: AchievementKey,
  streaks: Partial<Record<StreakKind, StreakState>>,
): Promise<boolean> {
  switch (key) {
    case "first_session":
    case "sessions_10": {
      const [row] = await tx
        .select({ n: count() })
        .from(GameSession)
        .where(
          and(eq(GameSession.userId, userId), isNotNull(GameSession.endedAt)),
        );
      const n = row?.n ?? 0;
      return key === "first_session" ? n >= 1 : n >= 10;
    }
    case "first_checkin": {
      const [row] = await tx
        .select({ n: count() })
        .from(Checkin)
        .where(eq(Checkin.userId, userId));
      return (row?.n ?? 0) >= 1;
    }
    case "checkin_streak_7":
      return (streaks.daily_checkin?.current ?? 0) >= 7;
    case "habit_prompts_25": {
      const [row] = await tx
        .select({ n: count() })
        .from(HabitPrompt)
        .where(
          and(eq(HabitPrompt.userId, userId), eq(HabitPrompt.status, "done")),
        );
      return (row?.n ?? 0) >= 25;
    }
    case "hydration_streak_7":
      return (streaks.habit_hydrate?.current ?? 0) >= 7;
  }
}

/**
 * Evaluates achievement candidates for the event that just fired and unlocks
 * any newly satisfied ones: inserts `UserAchievement` (onConflictDoNothing)
 * and, only when that insert actually happens, an `achievement_unlocked`
 * `reward_event` directly (not via `recordRewardEvent` — unlocks never
 * recurse into further evaluation). Must run inside the same transaction as
 * the triggering event and any streak updates (`streaks` passed in are this
 * call's freshly-updated counters, not re-read from the DB).
 */
export async function evaluateAchievements(
  tx: TxDb,
  userId: string,
  eventType: RewardEventType,
  streaks: Partial<Record<StreakKind, StreakState>>,
): Promise<void> {
  const candidates = ACHIEVEMENT_CANDIDATES[eventType] ?? [];
  for (const key of candidates) {
    if (!(await isSatisfied(tx, userId, key, streaks))) {
      continue;
    }

    const [unlocked] = await tx
      .insert(UserAchievement)
      .values({ userId, achievementKey: key })
      .onConflictDoNothing()
      .returning({ userId: UserAchievement.userId });
    if (!unlocked) {
      continue; // already unlocked previously
    }

    const def = ACHIEVEMENT_DEFS[key];
    await tx
      .insert(RewardEvent)
      .values({
        userId,
        eventType: "achievement_unlocked",
        xp: def.xp,
        sourceKind: REWARD_EVENT_DEFS.achievement_unlocked.sourceKind,
        sourceId: key,
      })
      .onConflictDoNothing();
  }
}
