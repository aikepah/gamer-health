"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";

const STREAK_LABELS: Record<string, string> = {
  daily_checkin: "Check-in streak",
  daily_habit: "Habit streak",
  habit_hydrate: "Hydration streak",
};

/**
 * Level, XP progress bar, and current streaks. Presentation-only — fetches
 * its own data via `gamification.summary` so it can be dropped onto any page
 * (home, dashboard) without prop plumbing.
 */
export function PlayerStatsCard() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.gamification.summary.queryOptions());

  if (!data) {
    return (
      <div className="border-border w-full max-w-md rounded-lg border p-4">
        <div className="bg-muted h-20 w-full animate-pulse rounded" />
      </div>
    );
  }

  const span = data.nextLevelXp - data.levelFloorXp;
  const progressPct = Math.round(Math.min(1, Math.max(0, data.progress)) * 100);
  const xpIntoLevel = data.totalXp - data.levelFloorXp;

  return (
    <div className="border-border w-full max-w-md rounded-lg border p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-semibold">Level {data.level}</p>
        <p className="text-muted-foreground text-sm">{data.totalXp} XP</p>
      </div>
      <div className="bg-muted mt-2 h-2 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        {xpIntoLevel} / {span} XP to level {data.level + 1}
      </p>
      {data.streaks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {data.streaks.map((s) => (
            <span
              key={s.kind}
              className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-1 text-xs font-medium"
            >
              {STREAK_LABELS[s.kind] ?? s.kind}: {s.current}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
