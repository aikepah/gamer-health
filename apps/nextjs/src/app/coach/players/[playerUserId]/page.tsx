import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import {
  getCoachPlayerOverviewOrNull,
  HydrateClient,
  prefetch,
  trpc,
} from "~/trpc/server";
import { CoachPlayerOverviewPanel } from "./_components/coach-player-overview-panel";
import { GoalsPanel } from "./_components/goals-panel";
import { PlayerHabitsPanel } from "./_components/player-habits-panel";

const DEFAULT_DAYS = 7;

/**
 * Shared coach-side player detail page (#12/#13/#14 each land a section
 * here). #12 (coach-player-tracking) owns the identity/activity overview,
 * driven by a single `coaching.players.overview` call authorized once via
 * `assertCoachOf`; #13 adds the Goals panel and #14 the assigned-habits
 * panel below it, each in its own component so the features don't collide
 * on this file.
 *
 * `getCoachPlayerOverviewOrNull` resolves the overview server-side so a
 * non-roster player, an ended relationship, or a non-coach caller (`/coach/*`
 * layout already redirects admins) bounces back to the roster with an error
 * toast rather than rendering a broken page — and it gates the goals and
 * habits panels too, since a caller who can't see the overview can't see
 * those either.
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
  prefetch(trpc.coaching.goals.listForPlayer.queryOptions({ playerUserId }));
  prefetch(
    trpc.coaching.assignedHabits.listPlayerHabits.queryOptions({
      playerUserId,
    }),
  );
  prefetch(trpc.coaching.assignedHabits.listAssignable.queryOptions());

  return (
    <HydrateClient>
      <main className="container max-w-5xl py-16">
        <CoachPlayerOverviewPanel
          playerUserId={playerUserId}
          defaultDays={DEFAULT_DAYS}
        />
        <div className="mt-10 flex flex-col gap-10">
          <GoalsPanel playerUserId={playerUserId} />
          <PlayerHabitsPanel playerUserId={playerUserId} />
        </div>
      </main>
    </HydrateClient>
  );
}
