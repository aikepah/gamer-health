"use client";

import { useQuery } from "@tanstack/react-query";

import type { HabitCompletionStats } from "@gamer-health/core";

import { useTRPC } from "~/trpc/react";
import { ChartCard, ChartEmptyState, ChartSkeleton } from "./chart-card";

/**
 * Completion-rate stat + per-habit done/total bars. Presentation-only.
 * Self-fetches via `dashboard.habitCompletion` (defaults to 7 days
 * server-side) unless `data` is passed in — the coach player-overview page
 * (#12) already has the data from its single authorized
 * `coaching.players.overview` call and passes it down instead of firing a
 * second, separately-authorized query.
 */
export function HabitCompletionCard({
  data: overrideData,
  rangeDays = 7,
}: {
  data?: HabitCompletionStats;
  rangeDays?: number;
} = {}) {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.dashboard.habitCompletion.queryOptions({}),
    enabled: overrideData === undefined,
  });
  const data = overrideData ?? query.data;
  const subtitle = `Last ${rangeDays} days`;

  if (!data) {
    return (
      <ChartCard title="Habit completion" subtitle={subtitle}>
        <ChartSkeleton />
      </ChartCard>
    );
  }

  if (data.completionRate === null) {
    return (
      <ChartCard title="Habit completion" subtitle={subtitle}>
        <ChartEmptyState
          message={`No habit prompts in the last ${rangeDays} days. Enable a habit to start tracking.`}
        />
      </ChartCard>
    );
  }

  const ratePct = Math.round(data.completionRate * 100);

  return (
    <ChartCard title="Habit completion" subtitle={subtitle}>
      <div className="flex items-baseline gap-2">
        <p className="text-3xl font-semibold">{ratePct}%</p>
        <p className="text-muted-foreground text-sm">
          {data.done} done · {data.skipped} skipped · {data.expired} expired
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {data.byHabit.map((k) => {
          const pct = k.total === 0 ? 0 : Math.round((k.done / k.total) * 100);
          return (
            <div key={k.definitionId}>
              <div className="flex justify-between text-xs">
                <span>{k.title}</span>
                <span className="text-muted-foreground">
                  {k.done}/{k.total}
                </span>
              </div>
              <div className="bg-muted mt-1 h-2 w-full overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
