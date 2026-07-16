import { Suspense } from "react";

import { getSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { AuthShowcase } from "./_components/auth-showcase";
import { CheckinHistory } from "./_components/checkins/checkin-history";
import { DailyCheckinCard } from "./_components/checkins/daily-checkin-card";
import { AchievementsList } from "./_components/gamification/achievements-list";
import { PlayerStatsCard } from "./_components/gamification/player-stats-card";
import { PromptTray } from "./_components/habits/prompt-tray";
import { ActiveSessionCard } from "./_components/sessions/active-session-card";

export default async function HomePage() {
  const session = await getSession();
  if (session) {
    prefetch(trpc.gameSession.active.queryOptions());
    prefetch(trpc.gamification.summary.queryOptions());
    prefetch(trpc.gamification.achievements.queryOptions());
  }

  if (!session) {
    return (
      <main className="container flex min-h-screen flex-col items-center justify-center gap-8 py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="text-primary text-sm font-semibold tracking-widest uppercase">
            Gamer Health
          </span>
          <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight sm:text-6xl">
            Level up your <span className="text-primary">health</span>, not just
            your character
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg">
            Log your sessions, build healthy habits, check in on your mood — and
            earn XP for taking care of yourself.
          </p>
        </div>
        <AuthShowcase />
      </main>
    );
  }

  return (
    <HydrateClient>
      <main className="container max-w-5xl py-8">
        <header className="mb-6">
          <AuthShowcase />
        </header>

        <div className="flex flex-col gap-4">
          <PromptTray />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <Suspense
                fallback={
                  <div className="bg-muted h-32 w-full animate-pulse rounded-lg" />
                }
              >
                <ActiveSessionCard />
              </Suspense>
              <DailyCheckinCard />
              <CheckinHistory />
            </div>
            <div className="flex flex-col gap-4">
              <PlayerStatsCard />
              <AchievementsList />
            </div>
          </div>
        </div>
      </main>
    </HydrateClient>
  );
}
