import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { GoalsPanel } from "./_components/goals-panel";

/**
 * Shared coach-side player detail page (#12/#13/#14 all land a section
 * here). This is the minimal shell — #12 (coach-player-tracking) owns the
 * player identity header / activity summary; #13 contributes only the
 * Goals panel below, in its own component so the three features don't
 * collide on the same file.
 */
export default async function CoachPlayerDetailPage({
  params,
}: {
  params: Promise<{ playerUserId: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  const { playerUserId } = await params;

  prefetch(trpc.coaching.goals.listForPlayer.queryOptions({ playerUserId }));

  return (
    <HydrateClient>
      <main className="container max-w-3xl py-16">
        <h1 className="mb-8 text-3xl font-bold tracking-tight">Player</h1>
        <GoalsPanel playerUserId={playerUserId} />
      </main>
    </HydrateClient>
  );
}
