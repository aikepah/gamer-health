import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { CoachHabitsLibrary } from "./_components/coach-habits-library";

export default function CoachHabitsPage() {
  prefetch(trpc.coaching.assignedHabits.listDefinitions.queryOptions());

  return (
    <HydrateClient>
      <main className="container max-w-4xl py-16">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">My habits</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Custom habits — gaming or otherwise (nutrition, workouts, sleep) — you
          can assign to your roster players.
        </p>
        <CoachHabitsLibrary />
      </main>
    </HydrateClient>
  );
}
