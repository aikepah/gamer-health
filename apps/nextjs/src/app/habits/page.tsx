import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { HabitsPageClient } from "./_components/habits-page-client";

export default async function HabitsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  prefetch(trpc.habit.list.queryOptions());

  return (
    <HydrateClient>
      <main className="container max-w-2xl py-16">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Habits</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Turn on the habits you want reminders for, and tune when they fire.
        </p>
        <HabitsPageClient />
      </main>
    </HydrateClient>
  );
}
