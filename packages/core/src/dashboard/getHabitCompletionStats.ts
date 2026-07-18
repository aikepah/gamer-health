import type { z } from "zod/v4";

import { and, eq, ne, sql } from "@gamer-health/db";
import { Habit, HabitDefinition, HabitPrompt } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { requireUserId } from "../lib/auth";
import { localDateString } from "../lib/dates";
import { getOrCreateProfile } from "../profile/getOrCreateProfile";
import { buildLocalDateRange, daysInput } from "./common";

export const getHabitCompletionStatsInput = daysInput(7);
export type GetHabitCompletionStatsInput = z.infer<
  typeof getHabitCompletionStatsInput
>;

type NonPendingStatus = "done" | "skipped" | "expired";

export interface HabitCompletionCountRow {
  definitionId: string;
  title: string;
  status: NonPendingStatus;
  count: number;
}

export interface HabitCompletionStats {
  done: number;
  skipped: number;
  expired: number;
  /** done / (done + skipped + expired); null when that denominator is 0. */
  completionRate: number | null;
  byHabit: {
    definitionId: string;
    title: string;
    done: number;
    total: number;
  }[];
}

/**
 * Pure: reduces per-(definition, status) counts (pending already excluded)
 * into the dashboard's completion summary shape.
 */
export function aggregateHabitCompletion(
  rows: HabitCompletionCountRow[],
): HabitCompletionStats {
  let done = 0;
  let skipped = 0;
  let expired = 0;
  const byHabit = new Map<
    string,
    { title: string; done: number; total: number }
  >();

  for (const row of rows) {
    if (row.status === "done") done += row.count;
    else if (row.status === "skipped") skipped += row.count;
    else expired += row.count;

    const entry = byHabit.get(row.definitionId) ?? {
      title: row.title,
      done: 0,
      total: 0,
    };
    entry.total += row.count;
    if (row.status === "done") entry.done += row.count;
    byHabit.set(row.definitionId, entry);
  }

  const total = done + skipped + expired;
  return {
    done,
    skipped,
    expired,
    completionRate: total === 0 ? null : done / total,
    byHabit: Array.from(byHabit.entries()).map(([definitionId, v]) => ({
      definitionId,
      ...v,
    })),
  };
}

/**
 * Habit-prompt completion stats over the last `input.days` days (default 7).
 * Bucketed by the local date of `dueAt`; `pending` prompts are excluded
 * entirely (not "not yet resolved" — just out of scope for a completion
 * rate). `byHabit` only lists definitions with at least one non-pending
 * prompt in range.
 */
export async function getHabitCompletionStats(
  ctx: ServiceCtx,
  input: GetHabitCompletionStatsInput,
): Promise<HabitCompletionStats> {
  const userId = requireUserId(ctx);
  const profile = await getOrCreateProfile(ctx);
  const tz = profile.timezone ?? "UTC";
  const today = localDateString(new Date(), tz);
  const { startDate, endDate } = buildLocalDateRange(today, input.days);

  const rows = await ctx.db
    .select({
      definitionId: Habit.definitionId,
      title: HabitDefinition.title,
      status: HabitPrompt.status,
      count: sql<string>`count(*)`,
    })
    .from(HabitPrompt)
    .innerJoin(Habit, eq(Habit.id, HabitPrompt.habitId))
    .innerJoin(HabitDefinition, eq(HabitDefinition.id, Habit.definitionId))
    .where(
      and(
        eq(HabitPrompt.userId, userId),
        ne(HabitPrompt.status, "pending"),
        sql`(${HabitPrompt.dueAt} AT TIME ZONE ${tz})::date BETWEEN ${startDate} AND ${endDate}`,
      ),
    )
    .groupBy(Habit.definitionId, HabitDefinition.title, HabitPrompt.status);

  return aggregateHabitCompletion(
    rows.map((r) => ({
      definitionId: r.definitionId,
      title: r.title,
      status: r.status as NonPendingStatus,
      count: Number(r.count),
    })),
  );
}
