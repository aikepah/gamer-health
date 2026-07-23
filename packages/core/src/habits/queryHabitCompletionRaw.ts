import { and, eq, ne, sql } from "@gamer-health/db";
import { Habit, HabitPrompt, Profile } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { buildLocalDateRange } from "../dashboard/common";
import { localDateString } from "../lib/dates";

export type NonPendingPromptStatus = "done" | "skipped" | "expired";

export interface HabitCompletionRawRow {
  habitId: string;
  definitionId: string;
  status: NonPendingPromptStatus;
  count: number;
}

export interface QueryHabitCompletionRawParams {
  userId: string;
  days: number;
  /** Injectable for tests only; defaults to the real current time. */
  now?: Date;
}

/**
 * Shared low-level aggregate: per-(habit, status) prompt counts over the
 * last `days` local days for `userId` (pending excluded entirely, same as
 * the dashboard's `getHabitCompletionStats`). Unlike `getOrCreateProfile`,
 * this never creates a `Profile` row — it's also called on a player's
 * behalf by their coach (#14's `listPlayerHabitsForCoach`), and a coach
 * action shouldn't have a side effect on the player's account. Missing
 * profile/timezone falls back to UTC.
 *
 * Exported at this level (not folded into `getHabitCompletionStats`) so any
 * feature needing a per-habit completion rate for an arbitrary user shares
 * one query instead of each writing its own — see
 * docs/features/coach-habit-assignment.md ("Overlaps #12 on the completion
 * aggregate — whichever lands first owns this function").
 */
export async function queryHabitCompletionRaw(
  ctx: ServiceCtx,
  params: QueryHabitCompletionRawParams,
): Promise<HabitCompletionRawRow[]> {
  const profile = await ctx.db.query.Profile.findFirst({
    where: eq(Profile.userId, params.userId),
  });
  const tz = profile?.timezone ?? "UTC";
  const now = params.now ?? new Date();
  const today = localDateString(now, tz);
  const { startDate, endDate } = buildLocalDateRange(today, params.days);

  const rows = await ctx.db
    .select({
      habitId: Habit.id,
      definitionId: Habit.definitionId,
      status: HabitPrompt.status,
      count: sql<string>`count(*)`,
    })
    .from(HabitPrompt)
    .innerJoin(Habit, eq(Habit.id, HabitPrompt.habitId))
    .where(
      and(
        eq(HabitPrompt.userId, params.userId),
        ne(HabitPrompt.status, "pending"),
        sql`(${HabitPrompt.dueAt} AT TIME ZONE ${tz})::date BETWEEN ${startDate} AND ${endDate}`,
      ),
    )
    .groupBy(Habit.id, Habit.definitionId, HabitPrompt.status);

  return rows.map((r) => ({
    habitId: r.habitId,
    definitionId: r.definitionId,
    status: r.status as NonPendingPromptStatus,
    count: Number(r.count),
  }));
}
