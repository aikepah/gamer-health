import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { SettingsForm } from "./_components/settings-form";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  prefetch(trpc.profile.get.queryOptions());

  return (
    <HydrateClient>
      <main className="container max-w-2xl py-16">
        <h1 className="mb-8 text-3xl font-bold tracking-tight">Settings</h1>
        <SettingsForm />
      </main>
    </HydrateClient>
  );
}
