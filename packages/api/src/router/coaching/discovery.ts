import type { TRPCRouterRecord } from "@trpc/server";

import {
  applyToCoach,
  applyToCoachInput,
  listMyApplications,
  searchCoaches,
  searchCoachesInput,
  withdrawApplication,
  withdrawApplicationInput,
} from "@gamer-health/core";

import { protectedProcedure, toServiceCtx } from "../../trpc";

/**
 * Coach discovery & application (#10): `/coaches` browse/filter, a coach's
 * detail page, and applying/withdrawing. All logic lives in
 * `packages/core/src/coaching/discovery/*` — see docs/features/coach-discovery.md.
 */
export const discoveryRouter = {
  search: protectedProcedure
    .input(searchCoachesInput)
    .query(({ ctx, input }) => {
      return searchCoaches(toServiceCtx(ctx), input);
    }),

  apply: protectedProcedure
    .input(applyToCoachInput)
    .mutation(({ ctx, input }) => {
      return applyToCoach(toServiceCtx(ctx), input);
    }),

  withdraw: protectedProcedure
    .input(withdrawApplicationInput)
    .mutation(({ ctx, input }) => {
      return withdrawApplication(toServiceCtx(ctx), input);
    }),

  myApplications: protectedProcedure.query(({ ctx }) => {
    return listMyApplications(toServiceCtx(ctx));
  }),
} satisfies TRPCRouterRecord;
