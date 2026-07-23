import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { CoachSessionsPanel } from "./_components/coach-sessions-panel";

/**
 * Coach's sessions page (#15): pending proposals, upcoming confirmed
 * sessions, and past sessions with Mark completed. Gated by
 * `apps/nextjs/src/app/coach/layout.tsx` (coach role only).
 */
export default function CoachSessionsPage() {
  prefetch(
    trpc.coaching.sessions.list.queryOptions({ scope: "upcoming", limit: 50 }),
  );
  prefetch(
    trpc.coaching.sessions.list.queryOptions({ scope: "past", limit: 50 }),
  );

  return (
    <HydrateClient>
      <main className="container max-w-3xl py-16">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Sessions</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Proposals awaiting your response, upcoming sessions, and history.
        </p>
        <CoachSessionsPanel />
      </main>
    </HydrateClient>
  );
}
