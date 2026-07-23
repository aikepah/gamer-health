import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { GoalsPageClient } from "./_components/goals-page-client";

export default async function GoalsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  prefetch(trpc.coaching.goals.listMine.queryOptions({}));
  prefetch(trpc.coaching.relationships.myCoach.queryOptions());

  return (
    <HydrateClient>
      <main className="container max-w-2xl py-16">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Goals</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Goals your coach has set for you — update their status and jot down
          how it's going.
        </p>
        <GoalsPageClient />
      </main>
    </HydrateClient>
  );
}
