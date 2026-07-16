import { Suspense } from "react";

import { getSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { AuthShowcase } from "./_components/auth-showcase";
import { CheckinHistory } from "./_components/checkins/checkin-history";
import { DailyCheckinCard } from "./_components/checkins/daily-checkin-card";
import { AchievementsList } from "./_components/gamification/achievements-list";
import { PlayerStatsCard } from "./_components/gamification/player-stats-card";
import { PromptTray } from "./_components/habits/prompt-tray";
import {
  CreatePostForm,
  PostCardSkeleton,
  PostList,
} from "./_components/posts";
import { ActiveSessionCard } from "./_components/sessions/active-session-card";

export default async function HomePage() {
  const session = await getSession();
  prefetch(trpc.post.all.queryOptions());
  if (session) {
    prefetch(trpc.gameSession.active.queryOptions());
    prefetch(trpc.gamification.summary.queryOptions());
    prefetch(trpc.gamification.achievements.queryOptions());
  }

  return (
    <HydrateClient>
      <main className="container h-screen py-16">
        <div className="flex flex-col items-center justify-center gap-4">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
            Create <span className="text-primary">T3</span> Turbo
          </h1>
          <AuthShowcase />

          {session && (
            <Suspense
              fallback={
                <div className="bg-muted h-32 w-full max-w-md animate-pulse rounded-lg" />
              }
            >
              <ActiveSessionCard />
            </Suspense>
          )}

          {session && <PlayerStatsCard />}
          {session && <PromptTray />}
          {session && <DailyCheckinCard />}
          {session && <CheckinHistory />}
          {session && <AchievementsList />}

          <CreatePostForm />
          <div className="w-full max-w-2xl overflow-y-scroll">
            <Suspense
              fallback={
                <div className="flex w-full flex-col gap-4">
                  <PostCardSkeleton />
                  <PostCardSkeleton />
                  <PostCardSkeleton />
                </div>
              }
            >
              <PostList />
            </Suspense>
          </div>
        </div>
      </main>
    </HydrateClient>
  );
}
