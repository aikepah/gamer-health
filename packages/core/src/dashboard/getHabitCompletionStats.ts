import type { z } from "zod/v4";

import { and, eq, ne, sql } from "@gamer-health/db";
import { Habit, HabitPrompt } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import type { HabitKind } from "../habits/definitions";
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
  kind: HabitKind;
  status: NonPendingStatus;
  count: number;
}

export interface HabitCompletionStats {
  done: number;
  skipped: number;
  expired: number;
  /** done / (done + skipped + expired); null when that denominator is 0. */
  completionRate: number | null;
  byKind: { kind: HabitKind; done: number; total: number }[];
}

/**
 * Pure: reduces per-(kind, status) counts (pending already excluded) into
 * the dashboard's completion summary shape.
 */
export function aggregateHabitCompletion(
  rows: HabitCompletionCountRow[],
): HabitCompletionStats {
  let done = 0;
  let skipped = 0;
  let expired = 0;
  const byKind = new Map<HabitKind, { done: number; total: number }>();

  for (const row of rows) {
    if (row.status === "done") done += row.count;
    else if (row.status === "skipped") skipped += row.count;
    else expired += row.count;

    const entry = byKind.get(row.kind) ?? { done: 0, total: 0 };
    entry.total += row.count;
    if (row.status === "done") entry.done += row.count;
    byKind.set(row.kind, entry);
  }

  const total = done + skipped + expired;
  return {
    done,
    skipped,
    expired,
    completionRate: total === 0 ? null : done / total,
    byKind: Array.from(byKind.entries()).map(([kind, v]) => ({ kind, ...v })),
  };
}

/**
 * Habit-prompt completion stats over the last `input.days` days (default 7).
 * Bucketed by the local date of `dueAt`; `pending` prompts are excluded
 * entirely (not "not yet resolved" — just out of scope for a completion
 * rate). `byKind` only lists kinds with at least one non-pending prompt in
 * range.
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
      kind: Habit.kind,
      status: HabitPrompt.status,
      count: sql<string>`count(*)`,
    })
    .from(HabitPrompt)
    .innerJoin(Habit, eq(Habit.id, HabitPrompt.habitId))
    .where(
      and(
        eq(HabitPrompt.userId, userId),
        ne(HabitPrompt.status, "pending"),
        sql`(${HabitPrompt.dueAt} AT TIME ZONE ${tz})::date BETWEEN ${startDate} AND ${endDate}`,
      ),
    )
    .groupBy(Habit.kind, HabitPrompt.status);

  return aggregateHabitCompletion(
    rows.map((r) => ({
      kind: r.kind,
      status: r.status as NonPendingStatus,
      count: Number(r.count),
    })),
  );
}
