import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { SessionsPageClient } from "./_components/sessions-page-client";

const PAGE_SIZE = 10;

export default async function SessionsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  prefetch(trpc.gameSession.list.queryOptions({ limit: PAGE_SIZE, offset: 0 }));

  return (
    <HydrateClient>
      <main className="container max-w-3xl py-16">
        <h1 className="mb-8 text-3xl font-bold tracking-tight">Sessions</h1>
        <SessionsPageClient pageSize={PAGE_SIZE} />
      </main>
    </HydrateClient>
  );
}
