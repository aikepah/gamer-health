import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@gamer-health/ui/button";

import { getSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { SessionsListPanel } from "./_components/sessions-list-panel";

/**
 * Player-facing coaching-sessions list (#15): Upcoming/Past, Cancel.
 *
 * Routed at `/coaching/sessions` rather than the spec's literal `/sessions`
 * — that path already belongs to gaming-session tracking
 * (`apps/nextjs/src/app/sessions`, phase 2). See the PR note.
 */
export default async function CoachingSessionsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  prefetch(
    trpc.coaching.sessions.list.queryOptions({ scope: "upcoming", limit: 50 }),
  );
  prefetch(
    trpc.coaching.sessions.list.queryOptions({ scope: "past", limit: 50 }),
  );

  return (
    <HydrateClient>
      <main className="container max-w-3xl py-16">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Coaching sessions
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Your scheduled time with your coach.
            </p>
          </div>
          <Button asChild>
            <Link href="/coaching/sessions/schedule">Schedule a session</Link>
          </Button>
        </div>
        <SessionsListPanel />
      </main>
    </HydrateClient>
  );
}
