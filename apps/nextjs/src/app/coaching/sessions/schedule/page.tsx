import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { HydrateClient, getServerMyCoach, prefetch, trpc } from "~/trpc/server";
import { SchedulePanel } from "./_components/schedule-panel";

/**
 * Player's session scheduler (#15). Redirects to `/coaches` when the caller
 * has no active coach — acceptance criterion 6: "a player without an
 * active coach cannot reach the scheduler". `getServerMyCoach` mirrors the
 * `requireMyCoachRelationship` FORBIDDEN the underlying query would throw
 * anyway, just resolved synchronously for the redirect.
 */
export default async function ScheduleSessionPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  const myCoach = await getServerMyCoach();
  if (!myCoach) {
    redirect("/coaches");
  }

  prefetch(trpc.coaching.sessions.schedulingContext.queryOptions());

  return (
    <HydrateClient>
      <main className="container max-w-3xl py-16">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">
          Schedule a session
        </h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Pick a time inside your coach's availability.
        </p>
        <SchedulePanel />
      </main>
    </HydrateClient>
  );
}
