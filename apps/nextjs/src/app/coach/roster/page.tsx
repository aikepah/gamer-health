import { Suspense } from "react";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { RosterErrorToast } from "./_components/roster-error-toast";
import { RosterPanel } from "./_components/roster-panel";

export default function CoachRosterPage() {
  prefetch(
    trpc.coaching.relationships.roster.queryOptions({ status: "applied" }),
  );
  prefetch(
    trpc.coaching.relationships.roster.queryOptions({ status: "active" }),
  );

  return (
    <HydrateClient>
      <main className="container max-w-3xl py-16">
        <Suspense>
          <RosterErrorToast />
        </Suspense>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Roster</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Your active players and pending applications.
        </p>
        <RosterPanel />
      </main>
    </HydrateClient>
  );
}
