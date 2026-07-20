import type { CoachSpecialty } from "@gamer-health/validators";
import { asc, eq } from "@gamer-health/db";
import {
  CoachAvailability,
  CoachGame,
  CoachProfile,
  Profile,
  user,
} from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";

export interface AvailabilityBlock {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface CoachProfileDetail {
  userId: string;
  name: string;
  headline: string | null;
  bio: string | null;
  specialties: CoachSpecialty[];
  isPublished: boolean;
  acceptingApplications: boolean;
  timezone: string | null;
  games: { id: string; name: string; platform: string | null }[];
  availability: AvailabilityBlock[];
}

export type CoachProfileRow = typeof CoachProfile.$inferSelect;

/**
 * Ensures a `coach_profile` row exists for `coachUserId`, creating one with
 * `specialties: []` if it doesn't. Idempotent (`onConflictDoNothing` + a
 * re-select on the race). Does NOT check the caller's role — callers that
 * need the role guard should call `requireRole` themselves first.
 */
export async function ensureCoachProfileRow(
  ctx: ServiceCtx,
  coachUserId: string,
): Promise<CoachProfileRow> {
  const existing = await ctx.db.query.CoachProfile.findFirst({
    where: eq(CoachProfile.userId, coachUserId),
  });
  if (existing) {
    return existing;
  }

  const [inserted] = await ctx.db
    .insert(CoachProfile)
    .values({ userId: coachUserId, specialties: [] })
    .onConflictDoNothing()
    .returning();
  if (inserted) {
    return inserted;
  }

  const created = await ctx.db.query.CoachProfile.findFirst({
    where: eq(CoachProfile.userId, coachUserId),
  });
  if (!created) {
    throw new CoreError("NOT_FOUND", "Failed to create coach profile");
  }
  return created;
}

/** The coach's display name (from `user`) and timezone (from `profile`). */
export async function fetchCoachIdentity(
  ctx: ServiceCtx,
  coachUserId: string,
): Promise<{ name: string; timezone: string | null } | null> {
  const [userRow, profileRow] = await Promise.all([
    ctx.db.query.user.findFirst({
      where: eq(user.id, coachUserId),
      columns: { name: true },
    }),
    ctx.db.query.Profile.findFirst({
      where: eq(Profile.userId, coachUserId),
      columns: { timezone: true },
    }),
  ]);
  if (!userRow) {
    return null;
  }
  return { name: userRow.name, timezone: profileRow?.timezone ?? null };
}

/**
 * Assembles the full public-facing `CoachProfileDetail` from a known
 * `coach_profile` row plus the coach's games (`coach_game`) and availability
 * (`coach_availability`). Shared by every service in this module that returns
 * a `CoachProfileDetail`.
 */
export async function buildCoachProfileDetail(
  ctx: ServiceCtx,
  coachUserId: string,
  identity: { name: string; timezone: string | null },
  coachProfile: CoachProfileRow,
): Promise<CoachProfileDetail> {
  const [gameRows, availabilityRows] = await Promise.all([
    ctx.db.query.CoachGame.findMany({
      where: eq(CoachGame.coachUserId, coachUserId),
      with: { game: true },
    }),
    ctx.db.query.CoachAvailability.findMany({
      where: eq(CoachAvailability.coachUserId, coachUserId),
      orderBy: [
        asc(CoachAvailability.weekday),
        asc(CoachAvailability.startMinute),
      ],
    }),
  ]);

  return {
    userId: coachUserId,
    name: identity.name,
    headline: coachProfile.headline,
    bio: coachProfile.bio,
    specialties: coachProfile.specialties as CoachSpecialty[],
    isPublished: coachProfile.isPublished,
    acceptingApplications: coachProfile.acceptingApplications,
    timezone: identity.timezone,
    games: gameRows
      .map((row) => ({
        id: row.game.id,
        name: row.game.name,
        platform: row.game.platform,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    availability: availabilityRows.map((row) => ({
      id: row.id,
      weekday: row.weekday,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
    })),
  };
}

/**
 * Returns the caller's coach profile, creating the `coach_profile` row
 * (`specialties: []`, unpublished) the first time a coach opens
 * `/coach/profile`. `FORBIDDEN` for non-coaches (see `requireRole`).
 */
export async function getOrCreateCoachProfile(
  ctx: ServiceCtx,
): Promise<CoachProfileDetail> {
  const authz = await requireRole(ctx, ["coach"]);

  const [coachProfile, identity] = await Promise.all([
    ensureCoachProfileRow(ctx, authz.userId),
    fetchCoachIdentity(ctx, authz.userId),
  ]);
  if (!identity) {
    throw new CoreError("NOT_FOUND", "User not found");
  }

  return buildCoachProfileDetail(ctx, authz.userId, identity, coachProfile);
}
