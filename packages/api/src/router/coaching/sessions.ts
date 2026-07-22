import type { TRPCRouterRecord } from "@trpc/server";

import {
  cancelCoachingSession,
  cancelCoachingSessionInput,
  confirmCoachingSession,
  confirmCoachingSessionInput,
  getSchedulingContext,
  listCoachingSessions,
  listCoachingSessionsInput,
  markSessionCompleted,
  markSessionCompletedInput,
  proposeCoachingSession,
  proposeCoachingSessionInput,
} from "@gamer-health/core";

import { coachProcedure, protectedProcedure, toServiceCtx } from "../../trpc";

/**
 * Coaching session scheduling (#15): a player proposes a slot inside their
 * coach's availability, the coach confirms or declines, either side can
 * cancel, both sides see Upcoming/Past. All logic lives in
 * `packages/core/src/coaching/sessions/*` — see
 * docs/features/coaching-sessions.md.
 */
export const sessionsRouter = {
  list: protectedProcedure
    .input(listCoachingSessionsInput)
    .query(({ ctx, input }) => {
      return listCoachingSessions(toServiceCtx(ctx), input);
    }),

  schedulingContext: protectedProcedure.query(({ ctx }) => {
    return getSchedulingContext(toServiceCtx(ctx));
  }),

  propose: protectedProcedure
    .input(proposeCoachingSessionInput)
    .mutation(({ ctx, input }) => {
      return proposeCoachingSession(toServiceCtx(ctx), input);
    }),

  cancel: protectedProcedure
    .input(cancelCoachingSessionInput)
    .mutation(({ ctx, input }) => {
      return cancelCoachingSession(toServiceCtx(ctx), input);
    }),

  confirm: coachProcedure
    .input(confirmCoachingSessionInput)
    .mutation(({ ctx, input }) => {
      return confirmCoachingSession(toServiceCtx(ctx), input);
    }),

  markCompleted: coachProcedure
    .input(markSessionCompletedInput)
    .mutation(({ ctx, input }) => {
      return markSessionCompleted(toServiceCtx(ctx), input);
    }),
} satisfies TRPCRouterRecord;
