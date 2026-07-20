import { z } from "zod/v4";

import type {
  CoachingRelationshipStatus,
  CoachSpecialty,
} from "@gamer-health/validators";
import {
  and,
  arrayOverlaps,
  asc,
  count,
  eq,
  exists,
  gt,
  ilike,
  inArray,
  lt,
  or,
} from "@gamer-health/db";
import {
  CoachAvailability,
  CoachGame,
  CoachingRelationship,
  CoachProfile,
  Profile,
  user,
} from "@gamer-health/db/schema";
import {
  COACH_SPECIALTIES,
  MINUTES_PER_DAY,
  OPEN_COACHING_RELATIONSHIP_STATUSES,
} from "@gamer-health/validators";

import type { ServiceCtx } from "../../ctx";
import { requireActiveUser } from "../../authz/requireRole";
import { publishedCoachWhere } from "./publishedCoachWhere";

export const searchCoachesInput = z.object({
  query: z.string().trim().max(120).optional(),
  gameId: z.uuid().optional(),
  specialties: z.array(z.enum(COACH_SPECIALTIES)).max(8).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  fromMinute: z.number().int().min(0).max(1439).optional(),
  toMinute: z.number().int().min(1).max(1440).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
});
export type SearchCoachesInput = z.infer<typeof searchCoachesInput>;

export interface CoachSearchRow {
  userId: string;
  name: string;
  headline: string | null;
  specialties: CoachSpecialty[];
  acceptingApplications: boolean;
  games: { id: string; name: string }[];
  availability: { weekday: number; startMinute: number; endMinute: number }[];
  timezone: string;
  /** The caller's own open relationship with this coach, if any. */
  myRelationship: { id: string; status: CoachingRelationshipStatus } | null;
}

export interface SearchCoachesResult {
  total: number;
  coaches: CoachSearchRow[];
}

/**
 * Lists published, discoverable coaches (see `publishedCoachWhere`) with
 * optional filters, all AND-combined: free-text (name or headline, ILIKE),
 * game (`EXISTS` against `coach_game`), specialty (array overlap), and
 * weekday/time-window availability (`EXISTS` against `coach_availability`,
 * matched by overlap in the coach's own local time — see the architecture
 * doc, cross-timezone conversion is a non-goal).
 *
 * Games, availability, and the caller's own relationship are fetched for the
 * returned page only, via three follow-up `inArray` queries — never a
 * per-row N+1, and never a fan-out join that would break `total`.
 */
export async function searchCoaches(
  ctx: ServiceCtx,
  input: SearchCoachesInput,
): Promise<SearchCoachesResult> {
  const authz = await requireActiveUser(ctx);

  const conditions = [publishedCoachWhere()];

  if (input.query) {
    const pattern = `%${input.query}%`;
    conditions.push(
      or(ilike(user.name, pattern), ilike(CoachProfile.headline, pattern)),
    );
  }

  if (input.gameId) {
    const gameId = input.gameId;
    conditions.push(
      exists(
        ctx.db
          .select({ coachUserId: CoachGame.coachUserId })
          .from(CoachGame)
          .where(
            and(
              eq(CoachGame.coachUserId, CoachProfile.userId),
              eq(CoachGame.gameId, gameId),
            ),
          ),
      ),
    );
  }

  if (input.specialties && input.specialties.length > 0) {
    conditions.push(arrayOverlaps(CoachProfile.specialties, input.specialties));
  }

  const hasWeekdays = input.weekdays !== undefined && input.weekdays.length > 0;
  if (
    hasWeekdays ||
    input.fromMinute !== undefined ||
    input.toMinute !== undefined
  ) {
    const fromMinute = input.fromMinute ?? 0;
    const toMinute = input.toMinute ?? MINUTES_PER_DAY;
    const availConditions = [
      eq(CoachAvailability.coachUserId, CoachProfile.userId),
      // Overlap: the block starts before the window ends, and ends after the
      // window starts.
      lt(CoachAvailability.startMinute, toMinute),
      gt(CoachAvailability.endMinute, fromMinute),
    ];
    if (hasWeekdays && input.weekdays) {
      availConditions.push(inArray(CoachAvailability.weekday, input.weekdays));
    }
    conditions.push(
      exists(
        ctx.db
          .select({ coachUserId: CoachAvailability.coachUserId })
          .from(CoachAvailability)
          .where(and(...availConditions)),
      ),
    );
  }

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    ctx.db
      .select({
        userId: CoachProfile.userId,
        name: user.name,
        headline: CoachProfile.headline,
        specialties: CoachProfile.specialties,
        acceptingApplications: CoachProfile.acceptingApplications,
        timezone: Profile.timezone,
      })
      .from(CoachProfile)
      .innerJoin(Profile, eq(Profile.userId, CoachProfile.userId))
      .innerJoin(user, eq(user.id, CoachProfile.userId))
      .where(where)
      .orderBy(asc(user.name), asc(CoachProfile.userId))
      .limit(input.limit)
      .offset(input.offset),
    ctx.db
      .select({ value: count() })
      .from(CoachProfile)
      .innerJoin(Profile, eq(Profile.userId, CoachProfile.userId))
      .innerJoin(user, eq(user.id, CoachProfile.userId))
      .where(where),
  ]);

  const total = totalRows[0]?.value ?? 0;
  const coachUserIds = rows.map((r) => r.userId);
  if (coachUserIds.length === 0) {
    return { total, coaches: [] };
  }

  const [gameRows, availabilityRows, relationshipRows] = await Promise.all([
    ctx.db.query.CoachGame.findMany({
      where: inArray(CoachGame.coachUserId, coachUserIds),
      with: { game: true },
    }),
    ctx.db.query.CoachAvailability.findMany({
      where: inArray(CoachAvailability.coachUserId, coachUserIds),
      orderBy: [
        asc(CoachAvailability.weekday),
        asc(CoachAvailability.startMinute),
      ],
    }),
    ctx.db.query.CoachingRelationship.findMany({
      where: and(
        eq(CoachingRelationship.playerUserId, authz.userId),
        inArray(CoachingRelationship.coachUserId, coachUserIds),
        inArray(
          CoachingRelationship.status,
          OPEN_COACHING_RELATIONSHIP_STATUSES,
        ),
      ),
    }),
  ]);

  const gamesByCoach = new Map<string, { id: string; name: string }[]>();
  for (const row of gameRows) {
    const existing = gamesByCoach.get(row.coachUserId) ?? [];
    existing.push({ id: row.game.id, name: row.game.name });
    gamesByCoach.set(row.coachUserId, existing);
  }
  for (const games of gamesByCoach.values()) {
    games.sort((a, b) => a.name.localeCompare(b.name));
  }

  const availabilityByCoach = new Map<
    string,
    { weekday: number; startMinute: number; endMinute: number }[]
  >();
  for (const row of availabilityRows) {
    const existing = availabilityByCoach.get(row.coachUserId) ?? [];
    existing.push({
      weekday: row.weekday,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
    });
    availabilityByCoach.set(row.coachUserId, existing);
  }

  const relationshipByCoach = new Map(
    relationshipRows.map((row) => [
      row.coachUserId,
      { id: row.id, status: row.status },
    ]),
  );

  const coaches: CoachSearchRow[] = rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    headline: row.headline,
    specialties: row.specialties as CoachSpecialty[],
    acceptingApplications: row.acceptingApplications,
    games: gamesByCoach.get(row.userId) ?? [],
    availability: availabilityByCoach.get(row.userId) ?? [],
    timezone: row.timezone ?? "UTC",
    myRelationship: relationshipByCoach.get(row.userId) ?? null,
  }));

  return { total, coaches };
}
