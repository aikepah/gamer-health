"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatDateLabel } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { ChartCard, ChartEmptyState, ChartSkeleton } from "./chart-card";

/**
 * Mood/energy (and sleep quality, if any is present) line chart over the
 * last 14 days, connecting over null gaps. Presentation-only — fetches via
 * `dashboard.wellnessTrend` (defaults to 14 days server-side).
 */
export function WellnessTrendChart() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.dashboard.wellnessTrend.queryOptions({}));

  if (!data) {
    return (
      <ChartCard title="Mood & energy trend" subtitle="Last 14 days">
        <ChartSkeleton height={240} />
      </ChartCard>
    );
  }

  const hasData = data.some((d) => d.avgMood !== null || d.avgEnergy !== null);
  const hasSleep = data.some((d) => d.avgSleepQuality !== null);

  return (
    <ChartCard title="Mood & energy trend" subtitle="Last 14 days">
      {!hasData ? (
        <ChartEmptyState
          height={240}
          message="No check-ins in the last 14 days. Log a check-in to see your trend."
        />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 4, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value: string) => formatDateLabel(value)}
              tick={{ fontSize: 12 }}
            />
            <YAxis domain={[1, 5]} tick={{ fontSize: 12 }} width={32} />
            <Tooltip
              labelFormatter={(label) => formatDateLabel(String(label))}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="avgMood"
              name="Mood"
              stroke="var(--chart-1)"
              connectNulls
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="avgEnergy"
              name="Energy"
              stroke="var(--chart-2)"
              connectNulls
              dot={{ r: 3 }}
            />
            {hasSleep && (
              <Line
                type="monotone"
                dataKey="avgSleepQuality"
                name="Sleep quality"
                stroke="var(--chart-3)"
                connectNulls
                dot={{ r: 3 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
