import { notFound, redirect } from "next/navigation";

import { CoachProfileCard } from "~/app/_components/coaching/coach-profile-card";
import { getSession } from "~/auth/server";
import {
  getPublicCoachProfileOrNull,
  HydrateClient,
  prefetch,
  trpc,
} from "~/trpc/server";
import { ApplyPanel } from "./_components/apply-panel";

export default async function CoachDetailPage({
  params,
}: {
  params: Promise<{ coachUserId: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  const { coachUserId } = await params;
  const profile = await getPublicCoachProfileOrNull(coachUserId);
  if (!profile) {
    notFound();
  }

  prefetch(trpc.coaching.profile.getPublic.queryOptions({ coachUserId }));
  prefetch(trpc.coaching.discovery.myApplications.queryOptions());

  return (
    <HydrateClient>
      <main className="container max-w-2xl py-16">
        <div className="flex flex-col gap-6">
          <CoachProfileCard profile={profile} />
          <ApplyPanel
            coachUserId={coachUserId}
            isSelf={session.user.id === coachUserId}
          />
        </div>
      </main>
    </HydrateClient>
  );
}
