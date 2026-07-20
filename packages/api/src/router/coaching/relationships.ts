import type { TRPCRouterRecord } from "@trpc/server";

import {
  acceptCoachApplication,
  acceptCoachApplicationInput,
  declineCoachApplication,
  declineCoachApplicationInput,
  endCoachingRelationship,
  endCoachingRelationshipInput,
  getMyCoach,
  listCoachRoster,
  listCoachRosterInput,
} from "@gamer-health/core";

import { coachProcedure, protectedProcedure, toServiceCtx } from "../../trpc";

/**
 * Coaching relationships & roster (#11): a coach's roster + application
 * inbox, accept/decline, and either side ending an active relationship. All
 * logic lives in `packages/core/src/coaching/relationships/*` — see
 * docs/features/coaching-relationships.md.
 */
export const relationshipsRouter = {
  roster: coachProcedure.input(listCoachRosterInput).query(({ ctx, input }) => {
    return listCoachRoster(toServiceCtx(ctx), input);
  }),

  accept: coachProcedure
    .input(acceptCoachApplicationInput)
    .mutation(({ ctx, input }) => {
      return acceptCoachApplication(toServiceCtx(ctx), input);
    }),

  decline: coachProcedure
    .input(declineCoachApplicationInput)
    .mutation(({ ctx, input }) => {
      return declineCoachApplication(toServiceCtx(ctx), input);
    }),

  end: protectedProcedure
    .input(endCoachingRelationshipInput)
    .mutation(({ ctx, input }) => {
      return endCoachingRelationship(toServiceCtx(ctx), input);
    }),

  myCoach: protectedProcedure.query(({ ctx }) => {
    return getMyCoach(toServiceCtx(ctx));
  }),
} satisfies TRPCRouterRecord;
