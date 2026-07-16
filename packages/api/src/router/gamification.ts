import type { TRPCRouterRecord } from "@trpc/server";

import {
  getGamificationSummary,
  listAchievements,
  listRecentRewardEvents,
  listRecentRewardEventsInput,
} from "@gamer-health/core";

import { protectedProcedure, toServiceCtx } from "../trpc";

export const gamificationRouter = {
  summary: protectedProcedure.query(({ ctx }) => {
    return getGamificationSummary(toServiceCtx(ctx));
  }),

  achievements: protectedProcedure.query(({ ctx }) => {
    return listAchievements(toServiceCtx(ctx));
  }),

  recentEvents: protectedProcedure
    .input(listRecentRewardEventsInput)
    .query(({ ctx, input }) => {
      return listRecentRewardEvents(toServiceCtx(ctx), input);
    }),
} satisfies TRPCRouterRecord;
