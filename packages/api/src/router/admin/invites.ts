import type { TRPCRouterRecord } from "@trpc/server";

import {
  createCoachInvite,
  createCoachInviteInput,
  listCoachInvites,
  listCoachInvitesInput,
  revokeCoachInvite,
  revokeCoachInviteInput,
} from "@gamer-health/core";

import { adminProcedure, toServiceCtx } from "../../trpc";

export const invitesRouter = {
  create: adminProcedure
    .input(createCoachInviteInput)
    .mutation(({ ctx, input }) => {
      return createCoachInvite(toServiceCtx(ctx), input);
    }),

  list: adminProcedure.input(listCoachInvitesInput).query(({ ctx, input }) => {
    return listCoachInvites(toServiceCtx(ctx), input);
  }),

  revoke: adminProcedure
    .input(revokeCoachInviteInput)
    .mutation(({ ctx, input }) => {
      return revokeCoachInvite(toServiceCtx(ctx), input);
    }),
} satisfies TRPCRouterRecord;
