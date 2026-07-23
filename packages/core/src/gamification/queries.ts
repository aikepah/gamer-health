import { z } from "zod/v4";

import type { AchievementKey, StreakKind } from "@gamer-health/validators";
import { desc, eq, sum } from "@gamer-health/db";
import { RewardEvent, Streak, UserAchievement } from "@gamer-health/db/schema";
import { ACHIEVEMENT_DEFS, STREAK_KINDS } from "@gamer-health/validators";

import type { ServiceCtx } from "../ctx";
import type { LevelProgress } from "./level";
import { requireUserId } from "../lib/auth";
import { levelProgress } from "./level";

export type RewardEventRow = typeof RewardEvent.$inferSelect;

export interface StreakSummary {
  kind: StreakKind;
  current: number;
  longest: number;
  lastActivityDate: string | null;
}

export interface GamificationSummary extends LevelProgress {
  streaks: StreakSummary[];
}

export const getGamificationSummaryInput = z.object({});
export type GetGamificationSummaryInput = z.infer<
  typeof getGamificationSummaryInput
>;

/**
 * Total XP, derived level/progress, and all streak counters (zeroed when no
 * row exists yet) for `userId`. Explicit-user inner function — callers that
 * have already authorized a specific target user (e.g. coach-scoped reads
 * via `assertCoachOf`) call this directly; `getGamificationSummary` below is
 * the caller's-own-data wrapper.
 */
export async function getGamificationSummaryFor(
  ctx: ServiceCtx,
  userId: string,
): Promise<GamificationSummary> {
  const [[totals], streakRows] = await Promise.all([
    ctx.db
      .select({ totalXp: sum(RewardEvent.xp) })
      .from(RewardEvent)
      .where(eq(RewardEvent.userId, userId)),
    ctx.db.query.Streak.findMany({ where: eq(Streak.userId, userId) }),
  ]);

  const totalXp = Number(totals?.totalXp ?? 0);
  const streakByKind = new Map(streakRows.map((s) => [s.kind, s]));
  const streaks: StreakSummary[] = STREAK_KINDS.map((kind) => {
    const row = streakByKind.get(kind);
    return {
      kind,
      current: row?.current ?? 0,
      longest: row?.longest ?? 0,
      lastActivityDate: row?.lastActivityDate ?? null,
    };
  });

  return { ...levelProgress(totalXp), streaks };
}

/**
 * Total XP, derived level/progress, and all streak counters (zeroed when no
 * row exists yet) for the caller.
 */
export async function getGamificationSummary(
  ctx: ServiceCtx,
): Promise<GamificationSummary> {
  return getGamificationSummaryFor(ctx, requireUserId(ctx));
}

export interface AchievementSummary {
  key: AchievementKey;
  title: string;
  description: string;
  xp: number;
  unlockedAt: Date | null;
}

/** All `ACHIEVEMENT_DEFS`, merged with the caller's unlocks. */
export async function listAchievements(
  ctx: ServiceCtx,
): Promise<AchievementSummary[]> {
  const userId = requireUserId(ctx);

  const unlocked = await ctx.db.query.UserAchievement.findMany({
    where: eq(UserAchievement.userId, userId),
  });
  const unlockedAtByKey = new Map(
    unlocked.map((u) => [u.achievementKey, u.unlockedAt]),
  );

  return (
    Object.entries(ACHIEVEMENT_DEFS) as [
      AchievementKey,
      (typeof ACHIEVEMENT_DEFS)[AchievementKey],
    ][]
  ).map(([key, def]) => ({
    key,
    title: def.title,
    description: def.description,
    xp: def.xp,
    unlockedAt: unlockedAtByKey.get(key) ?? null,
  }));
}

export const listRecentRewardEventsInput = z.object({
  limit: z.number().int().min(1).max(50).default(20),
});
export type ListRecentRewardEventsInput = z.infer<
  typeof listRecentRewardEventsInput
>;

/** The caller's most recent reward events, newest first. */
export async function listRecentRewardEvents(
  ctx: ServiceCtx,
  input: ListRecentRewardEventsInput,
): Promise<RewardEventRow[]> {
  const userId = requireUserId(ctx);
  return ctx.db.query.RewardEvent.findMany({
    where: eq(RewardEvent.userId, userId),
    orderBy: desc(RewardEvent.createdAt),
    limit: input.limit,
  });
}
