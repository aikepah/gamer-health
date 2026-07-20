import { and, eq, isNull } from "@gamer-health/db";
import { CoachProfile, Profile } from "@gamer-health/db/schema";

/**
 * The single definition of "a coach is discoverable" (#10, per the
 * architecture): published, still has the `coach` role, and the account
 * isn't deactivated. `searchCoaches` uses this as a joined-query `WHERE`
 * (`coach_profile` × `profile`). `getPublicCoachProfile` / `getCoachAvailability`
 * (#9) apply the exact same three-part test to already-fetched rows via
 * `isCoachDiscoverable` below — one predicate, two call shapes, so discovery
 * and the public-profile services can't drift apart.
 */
export function publishedCoachWhere() {
  return and(
    eq(CoachProfile.isPublished, true),
    eq(Profile.role, "coach"),
    isNull(Profile.deactivatedAt),
  );
}

/** Same predicate as `publishedCoachWhere`, applied to already-fetched rows. */
export function isCoachDiscoverable(row: {
  isPublished: boolean;
  role: string | null | undefined;
  deactivatedAt: Date | null | undefined;
}): boolean {
  return row.isPublished && row.role === "coach" && row.deactivatedAt == null;
}
