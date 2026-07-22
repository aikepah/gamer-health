"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PlaytimeVsWellnessDay } from "@gamer-health/core";

import { formatDateLabel, formatDuration } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { ChartCard, ChartEmptyState, ChartSkeleton } from "./chart-card";

/**
 * Composed chart: bars = playtime minutes (left axis), line = average mood
 * (right axis, 1-5). Visual correlation only — no statistical coefficient.
 * Presentation-only. Self-fetches via `dashboard.playtimeVsWellness`
 * (defaults to 30 days server-side) unless `data` is passed in — the coach
 * player-overview page (#12) already has the data from its single authorized
 * `coaching.players.overview` call and passes it down instead of firing a
 * second, separately-authorized query.
 */
export function PlaytimeVsWellnessChart({
  data: overrideData,
  rangeDays = 30,
}: {
  data?: PlaytimeVsWellnessDay[];
  rangeDays?: number;
} = {}) {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.dashboard.playtimeVsWellness.queryOptions({}),
    enabled: overrideData === undefined,
  });
  const data = overrideData ?? query.data;
  const subtitle = `Last ${rangeDays} days`;

  if (!data) {
    return (
      <ChartCard title="Playtime vs. mood" subtitle={subtitle}>
        <ChartSkeleton height={260} />
      </ChartCard>
    );
  }

  if (data.length === 0) {
    return (
      <ChartCard title="Playtime vs. mood" subtitle={subtitle}>
        <ChartEmptyState
          height={260}
          message={`No sessions or check-ins in the last ${rangeDays} days yet.`}
        />
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Playtime vs. mood" subtitle={subtitle}>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 4, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => formatDateLabel(value)}
            tick={{ fontSize: 11 }}
          />
          <YAxis yAxisId="minutes" tick={{ fontSize: 12 }} width={40} />
          <YAxis
            yAxisId="mood"
            orientation="right"
            domain={[1, 5]}
            tick={{ fontSize: 12 }}
            width={32}
          />
          <Tooltip
            labelFormatter={(label) => formatDateLabel(String(label))}
            formatter={(value, name) =>
              name === "Playtime"
                ? [formatDuration(Number(value) * 60_000), name]
                : [value, name]
            }
          />
          <Bar
            yAxisId="minutes"
            dataKey="minutes"
            name="Playtime"
            fill="var(--chart-1)"
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="mood"
            type="monotone"
            dataKey="avgMood"
            name="Avg mood"
            stroke="var(--chart-4)"
            connectNulls
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
