import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { PlayerHabitsPanel } from "./_components/player-habits-panel";
import { PlayerHeader } from "./_components/player-header";

/**
 * A roster player's detail page, shared across #12 (tracking), #13 (goals),
 * and #14 (habit assignment) — each adds its own panel as a sibling
 * component here. #14 owns `PlayerHabitsPanel`; see
 * docs/features/coach-habit-assignment.md.
 */
export default async function CoachPlayerDetailPage({
  params,
}: {
  params: Promise<{ playerUserId: string }>;
}) {
  const { playerUserId } = await params;

  prefetch(trpc.coaching.relationships.roster.queryOptions({ status: "active" }));
  prefetch(
    trpc.coaching.assignedHabits.listPlayerHabits.queryOptions({
      playerUserId,
    }),
  );
  prefetch(trpc.coaching.assignedHabits.listAssignable.queryOptions());

  return (
    <HydrateClient>
      <main className="container max-w-4xl py-16">
        <PlayerHeader playerUserId={playerUserId} />
        <div className="flex flex-col gap-10">
          <PlayerHabitsPanel playerUserId={playerUserId} />
        </div>
      </main>
    </HydrateClient>
  );
}
