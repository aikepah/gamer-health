import type { TRPCRouterRecord } from "@trpc/server";

import {
  getHabitCompletionStats,
  getHabitCompletionStatsInput,
  getPlaytimeByDay,
  getPlaytimeByDayInput,
  getPlaytimeVsWellness,
  getPlaytimeVsWellnessInput,
  getWellnessTrend,
  getWellnessTrendInput,
} from "@gamer-health/core";

import { protectedProcedure, toServiceCtx } from "../trpc";

export const dashboardRouter = {
  playtimeByDay: protectedProcedure
    .input(getPlaytimeByDayInput)
    .query(({ ctx, input }) => {
      return getPlaytimeByDay(toServiceCtx(ctx), input);
    }),

  habitCompletion: protectedProcedure
    .input(getHabitCompletionStatsInput)
    .query(({ ctx, input }) => {
      return getHabitCompletionStats(toServiceCtx(ctx), input);
    }),

  wellnessTrend: protectedProcedure
    .input(getWellnessTrendInput)
    .query(({ ctx, input }) => {
      return getWellnessTrend(toServiceCtx(ctx), input);
    }),

  playtimeVsWellness: protectedProcedure
    .input(getPlaytimeVsWellnessInput)
    .query(({ ctx, input }) => {
      return getPlaytimeVsWellness(toServiceCtx(ctx), input);
    }),
} satisfies TRPCRouterRecord;
