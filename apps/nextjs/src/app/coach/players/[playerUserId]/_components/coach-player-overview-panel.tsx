"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@gamer-health/ui/button";

import { HabitCompletionCard } from "~/app/_components/dashboard/habit-completion-card";
import { PlaytimeVsWellnessChart } from "~/app/_components/dashboard/playtime-vs-wellness-chart";
import { WeeklyPlaytimeChart } from "~/app/_components/dashboard/weekly-playtime-chart";
import { WellnessTrendChart } from "~/app/_components/dashboard/wellness-trend-chart";
import { PlayerStatsCard } from "~/app/_components/gamification/player-stats-card";
import { useTRPC } from "~/trpc/react";
import { RecentCheckinsPanel } from "./recent-checkins-panel";
import { RecentSessionsTable } from "./recent-sessions-table";

const DAY_OPTIONS = [7, 14, 30] as const;

/**
 * The coach player-overview page's client shell (#12): a day-range selector
 * (7/14/30) that drives every range-based panel from ONE
 * `coaching.players.overview` query (re-fetched on range change — the
 * service re-authorizes via `assertCoachOf` on every call, so there is no
 * separate "authorize once, cache forever" state to manage here). Every
 * chart below is the existing player-dashboard component, fed this data as
 * a prop instead of self-fetching.
 */
export function CoachPlayerOverviewPanel({
  playerUserId,
  defaultDays,
}: {
  playerUserId: string;
  defaultDays: number;
}) {
  const [days, setDays] = useState<number>(defaultDays);
  const trpc = useTRPC();
  const { data: overview } = useQuery(
    trpc.coaching.players.overview.queryOptions({ playerUserId, days }),
  );

  if (!overview) {
    return (
      <div className="flex flex-col gap-6">
        <div className="bg-muted h-10 w-full animate-pulse rounded-lg" />
        <div className="bg-muted h-24 w-full max-w-md animate-pulse rounded-lg" />
        <div className="bg-muted h-64 w-full animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-border bg-muted/50 text-muted-foreground rounded-lg border px-4 py-2 text-sm">
        Read-only — shared with you by {overview.player.name}.
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {overview.player.name}
          </h1>
          {overview.relationship.startedAt && (
            <p className="text-muted-foreground text-sm">
              Coaching since{" "}
              {new Date(overview.relationship.startedAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {DAY_OPTIONS.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={option === days ? "default" : "outline"}
              onClick={() => setDays(option)}
            >
              {option}d
            </Button>
          ))}
        </div>
      </div>

      <PlayerStatsCard data={overview.gamification} />

      <div className="grid gap-6 md:grid-cols-2">
        <WeeklyPlaytimeChart data={overview.playtime} rangeDays={days} />
        <HabitCompletionCard data={overview.habits} rangeDays={days} />
      </div>

      <WellnessTrendChart data={overview.wellness} rangeDays={days} />
      <PlaytimeVsWellnessChart
        data={overview.playtimeVsWellness}
        rangeDays={days}
      />

      <RecentSessionsTable playerUserId={playerUserId} />
      <RecentCheckinsPanel playerUserId={playerUserId} />
    </div>
  );
}
