import { and, desc, eq } from "@gamer-health/db";
import { Checkin } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { localDateString } from "../lib/dates";
import { getOrCreateProfile } from "../profile/getOrCreateProfile";

export type CheckinRow = typeof Checkin.$inferSelect;

/**
 * Returns the caller's `daily` check-in for today (profile timezone), or
 * `null` if none exists yet. Since the once-per-day guard prevents more than
 * one `daily` check-in per local day, the most recently created `daily`
 * check-in is sufficient to answer "is there one for today" — no need to
 * scan full history.
 */
export async function findTodayDailyCheckin(
  ctx: ServiceCtx,
  userId: string,
  now: Date = new Date(),
): Promise<CheckinRow | null> {
  const profile = await getOrCreateProfile(ctx);
  const tz = profile.timezone ?? "UTC";
  const today = localDateString(now, tz);

  const mostRecent = await ctx.db.query.Checkin.findFirst({
    where: and(eq(Checkin.userId, userId), eq(Checkin.context, "daily")),
    orderBy: desc(Checkin.createdAt),
  });

  if (mostRecent && localDateString(mostRecent.createdAt, tz) === today) {
    return mostRecent;
  }
  return null;
}
