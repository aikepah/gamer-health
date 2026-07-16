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

import { formatDateLabel, formatDuration, formatMinutesAsHours } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { ChartCard, ChartEmptyState, ChartSkeleton } from "./chart-card";

/**
 * Bar chart of minutes played per local day, last 7 days. Presentation-only
 * — fetches via `dashboard.playtimeByDay` (defaults to 7 days server-side).
 */
export function WeeklyPlaytimeChart() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.dashboard.playtimeByDay.queryOptions({}));

  if (!data) {
    return (
      <ChartCard title="Weekly playtime" subtitle="Last 7 days">
        <ChartSkeleton />
      </ChartCard>
    );
  }

  const hasData = data.some((d) => d.minutes > 0);

  return (
    <ChartCard title="Weekly playtime" subtitle="Last 7 days">
      {!hasData ? (
        <ChartEmptyState message="No sessions logged in the last 7 days. Log a session to see it here." />
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
