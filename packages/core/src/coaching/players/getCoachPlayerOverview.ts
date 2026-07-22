import { z } from "zod/v4";

import { and, eq } from "@gamer-health/db";
import { CoachingRelationship, user } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import type { HabitCompletionStats } from "../../dashboard/getHabitCompletionStats";
import type { PlaytimeByDay } from "../../dashboard/getPlaytimeByDay";
import type { PlaytimeVsWellnessDay } from "../../dashboard/getPlaytimeVsWellness";
import type { WellnessTrendDay } from "../../dashboard/getWellnessTrend";
import type { GamificationSummary } from "../../gamification/queries";
import { assertCoachOf } from "../../authz/assertCoachOf";
import { buildLocalDateRange } from "../../dashboard/common";
import {
  aggregateHabitCompletion,
  queryHabitCompletionRaw,
} from "../../dashboard/getHabitCompletionStats";
import { queryPlaytimeRaw, zeroFillPlaytime } from "../../dashboard/getPlaytimeByDay";
import { mergePlaytimeAndMood } from "../../dashboard/getPlaytimeVsWellness";
import { queryWellnessRaw, zeroFillWellness } from "../../dashboard/getWellnessTrend";
import { getGamificationSummaryFor } from "../../gamification/queries";
import { requireUserId } from "../../lib/auth";
import { localDateString } from "../../lib/dates";
import { CoreError } from "../../lib/errors";
import { getProfileFor } from "../../profile/getProfileFor";

export const getCoachPlayerOverviewInput = z.object({
  playerUserId: z.string().min(1),
  days: z.number().int().min(1).max(90).default(7),
});
export type GetCoachPlayerOverviewInput = z.infer<
  typeof getCoachPlayerOverviewInput
>;

export interface CoachPlayerOverview {
  player: { userId: string; name: string; timezone: string };
  relationship: { relationshipId: string; startedAt: Date | null };
  gamification: GamificationSummary;
  playtime: PlaytimeByDay[];
  habits: HabitCompletionStats;
  wellness: WellnessTrendDay[];
  playtimeVsWellness: PlaytimeVsWellnessDay[];
}

/**
 * A read-only coach view of a roster player's wellness data (#12):
 * session/habit/mood aggregates reusing the wave-1 dashboard queries,
 * pointed at `input.playerUserId` instead of the caller. One round trip —
 * `assertCoachOf` runs exactly once, as the first statement, so the whole
 * page authorizes in a single call rather than fanning out into several
 * separately-authorized queries. No new maths: every aggregate here is an
 * existing dashboard query/zero-fill/merge helper called with an explicit
 * user id.
 */
export async function getCoachPlayerOverview(
  ctx: ServiceCtx,
  input: GetCoachPlayerOverviewInput,
): Promise<CoachPlayerOverview> {
  await assertCoachOf(ctx, input.playerUserId);

  const coachUserId = requireUserId(ctx);
  const playerUserId = input.playerUserId;

  const relationshipRows = await ctx.db
    .select({
      relationshipId: CoachingRelationship.id,
      startedAt: CoachingRelationship.startedAt,
      playerName: user.name,
    })
    .from(CoachingRelationship)
    .innerJoin(user, eq(user.id, CoachingRelationship.playerUserId))
    .where(
      and(
        eq(CoachingRelationship.coachUserId, coachUserId),
        eq(CoachingRelationship.playerUserId, playerUserId),
        eq(CoachingRelationship.status, "active"),
      ),
    )
    .limit(1);
  const relationshipRow = relationshipRows[0];
  if (!relationshipRow) {
    // Defensive only — assertCoachOf just confirmed this above. Could only
    // trip on a relationship ended in the gap between the two queries.
    throw new CoreError("FORBIDDEN", "No active coaching relationship");
  }

  const profile = await getProfileFor(ctx, playerUserId);
  const tz = profile?.timezone ?? "UTC";
  const today = localDateString(new Date(), tz);
  const { startDate, endDate, dates } = buildLocalDateRange(today, input.days);

  const [gamification, playtimeRaw, wellnessRaw, habitRaw] = await Promise.all(
    [
      getGamificationSummaryFor(ctx, playerUserId),
      queryPlaytimeRaw(ctx, playerUserId, tz, startDate, endDate),
      queryWellnessRaw(ctx, playerUserId, tz, startDate, endDate),
      queryHabitCompletionRaw(ctx, playerUserId, tz, startDate, endDate),
    ],
  );

  return {
    player: {
      userId: playerUserId,
      name: relationshipRow.playerName,
      timezone: tz,
    },
    relationship: {
      relationshipId: relationshipRow.relationshipId,
      startedAt: relationshipRow.startedAt,
    },
    gamification,
    playtime: zeroFillPlaytime(playtimeRaw, dates),
    habits: aggregateHabitCompletion(habitRaw),
    wellness: zeroFillWellness(wellnessRaw, dates),
    playtimeVsWellness: mergePlaytimeAndMood(
      playtimeRaw,
      wellnessRaw.map((w) => ({ date: w.date, avgMood: w.avgMood })),
    ),
  };
}
