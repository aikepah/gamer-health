import type { z } from "zod/v4";

import { and, eq, isNotNull, sql } from "@gamer-health/db";
import { GameSession } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { requireUserId } from "../lib/auth";
import { localDateString } from "../lib/dates";
import { getOrCreateProfile } from "../profile/getOrCreateProfile";
import { buildLocalDateRange, daysInput } from "./common";

export const getPlaytimeByDayInput = daysInput(7);
export type GetPlaytimeByDayInput = z.infer<typeof getPlaytimeByDayInput>;

export interface PlaytimeByDay {
  date: string;
  minutes: number;
}

export interface RawPlaytimeDay {
  date: string;
  minutes: number;
}

/**
 * Raw (non zero-filled — only local days with at least one completed
 * session) per-day playtime minutes within `[startDate, endDate]`. Shared
 * with `getPlaytimeVsWellness`, which needs the unfilled rows to union
 * against check-in days rather than a full zero-filled calendar.
 */
export async function queryPlaytimeRaw(
  ctx: ServiceCtx,
  userId: string,
  tz: string,
  startDate: string,
  endDate: string,
): Promise<RawPlaytimeDay[]> {
  const dateExpr = sql`(${GameSession.startedAt} AT TIME ZONE ${tz})::date`;

  const rows = await ctx.db
    .select({
      date: sql<string>`to_char(${dateExpr}, 'YYYY-MM-DD')`,
      minutes: sql<string>`sum(extract(epoch from (${GameSession.endedAt} - ${GameSession.startedAt})) / 60)`,
    })
    .from(GameSession)
    .where(
      and(
        eq(GameSession.userId, userId),
        // Active sessions (no endedAt) are excluded everywhere.
        isNotNull(GameSession.endedAt),
        sql`${dateExpr} BETWEEN ${startDate} AND ${endDate}`,
      ),
    )
    .groupBy(sql`1`);

  return rows.map((r) => ({
    date: r.date,
    minutes: Math.round(Number(r.minutes)),
  }));
}

/** Pure: fills every date in `range` with 0 minutes when no row covers it. */
export function zeroFillPlaytime(
  rows: RawPlaytimeDay[],
  range: string[],
): PlaytimeByDay[] {
  const byDate = new Map(rows.map((r) => [r.date, r.minutes]));
  return range.map((date) => ({ date, minutes: byDate.get(date) ?? 0 }));
}

/**
 * Minutes of completed gameplay per local day over the last `input.days`
 * days (default 7), zero-filled, oldest first. Local day is the profile
 * timezone's calendar date of the session's `startedAt`.
 */
export async function getPlaytimeByDay(
  ctx: ServiceCtx,
  input: GetPlaytimeByDayInput,
): Promise<PlaytimeByDay[]> {
  const userId = requireUserId(ctx);
  const profile = await getOrCreateProfile(ctx);
  const tz = profile.timezone ?? "UTC";
  const today = localDateString(new Date(), tz);
  const { startDate, endDate, dates } = buildLocalDateRange(today, input.days);

  const rows = await queryPlaytimeRaw(ctx, userId, tz, startDate, endDate);
  return zeroFillPlaytime(rows, dates);
}
