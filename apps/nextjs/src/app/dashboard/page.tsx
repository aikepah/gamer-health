import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { AchievementsList } from "../_components/gamification/achievements-list";
import { PlayerStatsCard } from "../_components/gamification/player-stats-card";
import { HabitCompletionCard } from "../_components/dashboard/habit-completion-card";
import { PlaytimeVsWellnessChart } from "../_components/dashboard/playtime-vs-wellness-chart";
import { WeeklyPlaytimeChart } from "../_components/dashboard/weekly-playtime-chart";
import { WellnessTrendChart } from "../_components/dashboard/wellness-trend-chart";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  prefetch(trpc.gamification.summary.queryOptions());
  prefetch(trpc.gamification.achievements.queryOptions());
  prefetch(trpc.dashboard.playtimeByDay.queryOptions({}));
  prefetch(trpc.dashboard.habitCompletion.queryOptions({}));
  prefetch(trpc.dashboard.wellnessTrend.queryOptions({}));
  prefetch(trpc.dashboard.playtimeVsWellness.queryOptions({}));

  return (
    <HydrateClient>
      <main className="container max-w-5xl py-16">
        <h1 className="mb-8 text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="flex flex-col gap-6">
          <section className="flex flex-wrap items-start gap-4">
            <PlayerStatsCard />
            <AchievementsList />
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <WeeklyPlaytimeChart />
            <HabitCompletionCard />
          </div>

          <WellnessTrendChart />
          <PlaytimeVsWellnessChart />
        </div>
      </main>
    </HydrateClient>
  );
}
