import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { CoachProfileEditor } from "./_components/coach-profile-editor";

export default function CoachProfilePage() {
  prefetch(trpc.coaching.profile.getMine.queryOptions());

  return (
    <HydrateClient>
      <main className="container max-w-3xl py-16">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">
          Coach profile
        </h1>
        <p className="text-muted-foreground mb-8 text-sm">
          This is your public-facing profile. Publish it once you've added a
          headline, at least one game, and at least one availability block.
        </p>
        <CoachProfileEditor />
      </main>
    </HydrateClient>
  );
}
