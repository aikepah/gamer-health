import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { ContentPageClient } from "./_components/content-page-client";

const PAGE_SIZE = 50;

export default function AdminContentPage() {
  prefetch(
    trpc.admin.content.listGames.queryOptions({ limit: PAGE_SIZE, offset: 0 }),
  );
  prefetch(trpc.admin.content.listHabitDefinitions.queryOptions());

  return (
    <HydrateClient>
      <main className="container max-w-5xl py-16">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">
          Content management
        </h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Curate the shared games catalog and the default habit set offered to
          players.
        </p>
        <ContentPageClient pageSize={PAGE_SIZE} />
      </main>
    </HydrateClient>
  );
}
