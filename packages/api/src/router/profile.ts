import type { TRPCRouterRecord } from "@trpc/server";

import {
  getAuthz,
  getOrCreateProfile,
  updateProfile,
} from "@gamer-health/core";
import { UpsertProfileSchema } from "@gamer-health/db/schema";

import { protectedProcedure, toServiceCtx } from "../trpc";

export const profileRouter = {
  get: protectedProcedure.query(({ ctx }) => {
    return getOrCreateProfile(toServiceCtx(ctx));
  }),

  authz: protectedProcedure.query(({ ctx }) => {
    return getAuthz(toServiceCtx(ctx));
  }),

  update: protectedProcedure
    .input(UpsertProfileSchema)
    .mutation(({ ctx, input }) => {
      return updateProfile(toServiceCtx(ctx), input);
    }),
} satisfies TRPCRouterRecord;
