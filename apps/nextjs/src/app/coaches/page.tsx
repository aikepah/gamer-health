import { redirect } from "next/navigation";

import type { ParsedCoachSearchParams } from "./_lib/search-params";
import { getSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { CoachSearchPageClient } from "./_components/coach-search-page-client";
import {
  parseCoachSearchParams,
  parseInitialGameName,
} from "./_lib/search-params";

export default async function CoachesPage({
  searchParams,
}: {
  searchParams: Promise<ParsedCoachSearchParams>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  const params = await searchParams;
  const initialInput = parseCoachSearchParams(params);
  const initialGameName = parseInitialGameName(params);
  const initialGame =
    initialInput.gameId && initialGameName
      ? { id: initialInput.gameId, name: initialGameName }
      : null;

  prefetch(trpc.coaching.discovery.search.queryOptions(initialInput));
  prefetch(trpc.coaching.discovery.myApplications.queryOptions());

  return (
    <HydrateClient>
      <main className="container max-w-5xl py-16">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Find a coach</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Browse published coaches and apply to work with one.
        </p>
        <CoachSearchPageClient
          initialInput={initialInput}
          initialGame={initialGame}
        />
      </main>
    </HydrateClient>
  );
}
