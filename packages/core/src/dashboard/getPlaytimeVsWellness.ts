import type { z } from "zod/v4";

import type { ServiceCtx } from "../ctx";
import { requireUserId } from "../lib/auth";
import { localDateString } from "../lib/dates";
import { getOrCreateProfile } from "../profile/getOrCreateProfile";
import { buildLocalDateRange, daysInput } from "./common";
import { queryPlaytimeRaw } from "./getPlaytimeByDay";
import { queryWellnessRaw } from "./getWellnessTrend";

export const getPlaytimeVsWellnessInput = daysInput(30);
export type GetPlaytimeVsWellnessInput = z.infer<
  typeof getPlaytimeVsWellnessInput
>;

export interface PlaytimeVsWellnessDay {
  date: string;
  minutes: number;
  avgMood: number | null;
}

/**
 * Pure: unions per-day playtime and mood rows (each only present for days
 * with actual data — no zero-filled calendar), defaulting the side that's
 * missing (0 minutes / null mood) rather than dropping the day.
 */
export function mergePlaytimeAndMood(
  playtime: { date: string; minutes: number }[],
  mood: { date: string; avgMood: number }[],
): PlaytimeVsWellnessDay[] {
  const byDate = new Map<string, { minutes: number; avgMood: number | null }>();

  for (const p of playtime) {
    byDate.set(p.date, { minutes: p.minutes, avgMood: null });
  }
  for (const m of mood) {
    const existing = byDate.get(m.date);
    if (existing) {
      existing.avgMood = m.avgMood;
    } else {
      byDate.set(m.date, { minutes: 0, avgMood: m.avgMood });
    }
  }

  return Array.from(byDate.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Playtime minutes vs. average mood per local day over the last
 * `input.days` days (default 30) — a day appears if it has completed
 * session time, a check-in, or both.
 */
export async function getPlaytimeVsWellness(
  ctx: ServiceCtx,
  input: GetPlaytimeVsWellnessInput,
): Promise<PlaytimeVsWellnessDay[]> {
  const userId = requireUserId(ctx);
  const profile = await getOrCreateProfile(ctx);
  const tz = profile.timezone ?? "UTC";
  const today = localDateString(new Date(), tz);
  const { startDate, endDate } = buildLocalDateRange(today, input.days);

  const [playtime, wellness] = await Promise.all([
    queryPlaytimeRaw(ctx, userId, tz, startDate, endDate),
    queryWellnessRaw(ctx, userId, tz, startDate, endDate),
  ]);

  return mergePlaytimeAndMood(
    playtime,
    wellness.map((w) => ({ date: w.date, avgMood: w.avgMood })),
  );
}
