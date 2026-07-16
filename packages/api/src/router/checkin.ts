import type { TRPCRouterRecord } from "@trpc/server";

import {
  createCheckin,
  createCheckinInput,
  getTodayCheckinStatus,
  listCheckins,
  listCheckinsInput,
} from "@gamer-health/core";

import { protectedProcedure, toServiceCtx } from "../trpc";

export const checkinRouter = {
  create: protectedProcedure
    .input(createCheckinInput)
    .mutation(({ ctx, input }) => {
      return createCheckin(toServiceCtx(ctx), input);
    }),

  todayStatus: protectedProcedure.query(({ ctx }) => {
    return getTodayCheckinStatus(toServiceCtx(ctx));
  }),

  list: protectedProcedure.input(listCheckinsInput).query(({ ctx, input }) => {
    return listCheckins(toServiceCtx(ctx), input);
  }),
} satisfies TRPCRouterRecord;
