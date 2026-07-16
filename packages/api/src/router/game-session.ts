import type { TRPCRouterRecord } from "@trpc/server";

import {
  deleteSession,
  deleteSessionInput,
  getActiveSession,
  listSessions,
  listSessionsInput,
  logSession,
  logSessionInput,
  startSession,
  startSessionInput,
  stopSession,
  stopSessionInput,
  updateSession,
  updateSessionInput,
} from "@gamer-health/core";

import { protectedProcedure, toServiceCtx } from "../trpc";

export const gameSessionRouter = {
  active: protectedProcedure.query(({ ctx }) => {
    return getActiveSession(toServiceCtx(ctx));
  }),

  list: protectedProcedure.input(listSessionsInput).query(({ ctx, input }) => {
    return listSessions(toServiceCtx(ctx), input);
  }),

  start: protectedProcedure
    .input(startSessionInput)
    .mutation(({ ctx, input }) => {
      return startSession(toServiceCtx(ctx), input);
    }),

  stop: protectedProcedure
    .input(stopSessionInput)
    .mutation(({ ctx, input }) => {
      return stopSession(toServiceCtx(ctx), input);
    }),

  log: protectedProcedure.input(logSessionInput).mutation(({ ctx, input }) => {
    return logSession(toServiceCtx(ctx), input);
  }),

  update: protectedProcedure
    .input(updateSessionInput)
    .mutation(({ ctx, input }) => {
      return updateSession(toServiceCtx(ctx), input);
    }),

  delete: protectedProcedure
    .input(deleteSessionInput)
    .mutation(({ ctx, input }) => {
      return deleteSession(toServiceCtx(ctx), input);
    }),
} satisfies TRPCRouterRecord;
