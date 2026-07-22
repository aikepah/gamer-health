import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import {
  getCoachPlayerOverviewOrNull,
  HydrateClient,
  prefetch,
  trpc,
} from "~/trpc/server";
import { CoachPlayerOverviewPanel } from "./_components/coach-player-overview-panel";

const DEFAULT_DAYS = 7;

/**
 * Coach player progress tracking (#12): a read-only view of a roster
 * player's wellness data (session log, habit completion, mood/energy trend,
 * playtime-vs-wellness, streaks and level). Every panel is driven by a
 * single `coaching.players.overview` call, authorized once via
 * `assertCoachOf` inside that service — see
 * docs/features/coach-player-tracking.md.
 *
 * `getCoachPlayerOverviewOrNull` resolves the same call server-side so a
 * non-roster player, an ended relationship, or a non-coach caller (`/coach/*`
 * layout already redirects admins) bounces back to the roster with an error
 * toast rather than rendering a broken page.
 */
export default async function CoachPlayerPage({
  params,
}: {
  params: Promise<{ playerUserId: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  const { playerUserId } = await params;

  const overview = await getCoachPlayerOverviewOrNull(
    playerUserId,
    DEFAULT_DAYS,
  );
  if (!overview) {
    redirect("/coach/roster?error=not-your-player");
  }

  prefetch(
    trpc.coaching.players.overview.queryOptions({
      playerUserId,
      days: DEFAULT_DAYS,
    }),
  );

  return (
    <HydrateClient>
      <main className="container max-w-5xl py-16">
        <CoachPlayerOverviewPanel
          playerUserId={playerUserId}
          defaultDays={DEFAULT_DAYS}
        />
      </main>
    </HydrateClient>
  );
}
