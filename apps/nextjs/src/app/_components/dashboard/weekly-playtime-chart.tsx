"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PlaytimeByDay } from "@gamer-health/core";

import {
  formatDateLabel,
  formatDuration,
  formatMinutesAsHours,
} from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { ChartCard, ChartEmptyState, ChartSkeleton } from "./chart-card";

/**
 * Bar chart of minutes played per local day. Presentation-only. Self-fetches
 * via `dashboard.playtimeByDay` (defaults to 7 days server-side) unless
 * `data` is passed in — the coach player-overview page (#12) already has the
 * data from its single authorized `coaching.players.overview` call and
 * passes it down instead of firing a second, separately-authorized query.
 */
export function WeeklyPlaytimeChart({
  data: overrideData,
  rangeDays = 7,
}: {
  data?: PlaytimeByDay[];
  rangeDays?: number;
} = {}) {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.dashboard.playtimeByDay.queryOptions({}),
    enabled: overrideData === undefined,
  });
  const data = overrideData ?? query.data;
  const subtitle = `Last ${rangeDays} days`;

  if (!data) {
    return (
      <ChartCard title="Weekly playtime" subtitle={subtitle}>
        <ChartSkeleton />
      </ChartCard>
    );
  }

  const hasData = data.some((d) => d.minutes > 0);

  return (
    <ChartCard title="Weekly playtime" subtitle={subtitle}>
      {!hasData ? (
        <ChartEmptyState
          message={`No sessions logged in the last ${rangeDays} days. Log a session to see it here.`}
        />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value: string) => formatDateLabel(value)}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              tickFormatter={(value: number) => formatMinutesAsHours(value)}
              tick={{ fontSize: 12 }}
              width={48}
            />
            <Tooltip
              labelFormatter={(label) => formatDateLabel(String(label))}
              formatter={(value) => [
                formatDuration(Number(value) * 60_000),
                "Playtime",
              ]}
            />
            <Bar
              dataKey="minutes"
              fill="var(--chart-1)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
