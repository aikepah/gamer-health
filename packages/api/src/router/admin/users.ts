import type { TRPCRouterRecord } from "@trpc/server";

import {
  listAdminAuditLog,
  listAdminAuditLogInput,
  listUsers,
  listUsersInput,
  setUserActivation,
  setUserActivationInput,
  setUserRole,
  setUserRoleInput,
} from "@gamer-health/core";

import { adminProcedure, toServiceCtx } from "../../trpc";

export const usersRouter = {
  list: adminProcedure.input(listUsersInput).query(({ ctx, input }) => {
    return listUsers(toServiceCtx(ctx), input);
  }),

  setRole: adminProcedure
    .input(setUserRoleInput)
    .mutation(({ ctx, input }) => {
      return setUserRole(toServiceCtx(ctx), input);
    }),

  setActivation: adminProcedure
    .input(setUserActivationInput)
    .mutation(({ ctx, input }) => {
      return setUserActivation(toServiceCtx(ctx), input);
    }),

  auditLog: adminProcedure
    .input(listAdminAuditLogInput)
    .query(({ ctx, input }) => {
      return listAdminAuditLog(toServiceCtx(ctx), input);
    }),
} satisfies TRPCRouterRecord;
