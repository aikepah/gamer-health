import type { z } from "zod/v4";

import { and, eq, sql } from "@gamer-health/db";
import { Checkin } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { requireUserId } from "../lib/auth";
import { localDateString } from "../lib/dates";
import { getOrCreateProfile } from "../profile/getOrCreateProfile";
import { buildLocalDateRange, daysInput } from "./common";

export const getWellnessTrendInput = daysInput(14);
export type GetWellnessTrendInput = z.infer<typeof getWellnessTrendInput>;

export interface WellnessTrendDay {
  date: string;
  avgMood: number | null;
  avgEnergy: number | null;
  avgSleepQuality: number | null;
}

export interface RawWellnessDay {
  date: string;
  avgMood: number;
  avgEnergy: number | null;
  avgSleepQuality: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Raw (non zero-filled — only local days with at least one check-in)
 * per-day mood/energy/sleep-quality averages, over both check-in contexts,
 * within `[startDate, endDate]`. Shared with `getPlaytimeVsWellness`.
 */
export async function queryWellnessRaw(
  ctx: ServiceCtx,
  userId: string,
  tz: string,
  startDate: string,
  endDate: string,
): Promise<RawWellnessDay[]> {
  const dateExpr = sql`(${Checkin.createdAt} AT TIME ZONE ${tz})::date`;

  const rows = await ctx.db
    .select({
      date: sql<string>`to_char(${dateExpr}, 'YYYY-MM-DD')`,
      avgMood: sql<string>`avg(${Checkin.mood})`,
      avgEnergy: sql<string | null>`avg(${Checkin.energy})`,
      avgSleepQuality: sql<string | null>`avg(${Checkin.sleepQuality})`,
    })
    .from(Checkin)
    .where(
      and(
        eq(Checkin.userId, userId),
        sql`${dateExpr} BETWEEN ${startDate} AND ${endDate}`,
      ),
    )
    .groupBy(sql`1`);

  return rows.map((r) => ({
    date: r.date,
    avgMood: round2(Number(r.avgMood)),
    avgEnergy: r.avgEnergy == null ? null : round2(Number(r.avgEnergy)),
    avgSleepQuality:
      r.avgSleepQuality == null ? null : round2(Number(r.avgSleepQuality)),
  }));
}

/** Pure: fills every date in `range` with nulls when no check-in covers it. */
export function zeroFillWellness(
  rows: RawWellnessDay[],
  range: string[],
): WellnessTrendDay[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return range.map((date) => {
    const row = byDate.get(date);
    return {
      date,
      avgMood: row?.avgMood ?? null,
      avgEnergy: row?.avgEnergy ?? null,
      avgSleepQuality: row?.avgSleepQuality ?? null,
    };
  });
}

/**
 * Mood/energy/sleep-quality averages per local day over the last
 * `input.days` days (default 14), over all check-ins (both contexts),
 * zero-filled (null values) on days without one, oldest first.
 */
export async function getWellnessTrend(
  ctx: ServiceCtx,
  input: GetWellnessTrendInput,
): Promise<WellnessTrendDay[]> {
  const userId = requireUserId(ctx);
  const profile = await getOrCreateProfile(ctx);
  const tz = profile.timezone ?? "UTC";
  const today = localDateString(new Date(), tz);
  const { startDate, endDate, dates } = buildLocalDateRange(today, input.days);

  const rows = await queryWellnessRaw(ctx, userId, tz, startDate, endDate);
  return zeroFillWellness(rows, dates);
}
