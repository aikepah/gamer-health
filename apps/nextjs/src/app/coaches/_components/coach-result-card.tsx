import Link from "next/link";

import type { CoachSearchRow } from "@gamer-health/core";

import type { CoachProfileCardData } from "~/app/_components/coaching/coach-profile-card";
import { CoachProfileCard } from "~/app/_components/coaching/coach-profile-card";

/**
 * Adapts a discovery `CoachSearchRow` (list-shaped: no `bio`/`isPublished`,
 * availability blocks with no `id`) into the full `CoachProfileCardData`
 * shape #9's `CoachProfileCard` expects, so the browse grid and the detail
 * page render availability/specialties/games identically. Every row here is
 * published by construction (`searchCoaches` only returns discoverable
 * coaches), and `CoachProfileCard` never reads a block's `id` — it's only
 * present in the type for the editor's remove-button `key`.
 */
function toCardProfile(row: CoachSearchRow): CoachProfileCardData {
  return {
    userId: row.userId,
    name: row.name,
    headline: row.headline,
    bio: null,
    specialties: row.specialties,
    isPublished: true,
    acceptingApplications: row.acceptingApplications,
    timezone: row.timezone,
    games: row.games.map((game) => ({ ...game, platform: null })),
    availability: row.availability.map((block, index) => ({
      ...block,
      id: `${row.userId}-${index}`,
    })),
  };
}

export function CoachResultCard({ coach }: { coach: CoachSearchRow }) {
  return (
    <div className="flex flex-col gap-2">
      <Link
        href={`/coaches/${coach.userId}`}
        className="focus-visible:ring-ring block rounded-lg transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
      >
        <CoachProfileCard profile={toCardProfile(coach)} />
      </Link>
      {coach.myRelationship?.status === "applied" && (
        <p className="text-primary text-xs font-medium">Application pending</p>
      )}
    </div>
  );
}
