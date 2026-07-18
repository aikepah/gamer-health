import type { TRPCRouterRecord } from "@trpc/server";

import {
  acceptCoachInvite,
  acceptCoachInviteInput,
  getCoachInviteByToken,
  getCoachInviteByTokenInput,
} from "@gamer-health/core";

import { protectedProcedure, publicProcedure, toServiceCtx } from "../trpc";

export const inviteRouter = {
  // Public: the token itself is the credential, and the accept page needs
  // this before the visitor is necessarily signed in.
  byToken: publicProcedure
    .input(getCoachInviteByTokenInput)
    .query(({ ctx, input }) => {
      return getCoachInviteByToken(toServiceCtx(ctx), input);
    }),

  accept: protectedProcedure
    .input(acceptCoachInviteInput)
    .mutation(({ ctx, input }) => {
      return acceptCoachInvite(toServiceCtx(ctx), input);
    }),
} satisfies TRPCRouterRecord;
