import type { TRPCRouterRecord } from "@trpc/server";

import {
  createGoal,
  createGoalInput,
  deleteGoal,
  deleteGoalInput,
  getRosterGoalSummary,
  listMyGoals,
  listMyGoalsInput,
  listPlayerGoals,
  listPlayerGoalsInput,
  setGoalStatus,
  setGoalStatusInput,
  updateGoal,
  updateGoalInput,
  updateGoalProgress,
  updateGoalProgressInput,
} from "@gamer-health/core";

import { coachProcedure, protectedProcedure, toServiceCtx } from "../../trpc";

/**
 * Coach-assigned goals (#13): all logic lives in
 * `packages/core/src/coaching/goals/*` — see docs/features/goals.md. Every
 * coach-scoped route here goes through `assertCoachOf` inside the core
 * function, never a check here.
 */
export const goalsRouter = {
  create: coachProcedure.input(createGoalInput).mutation(({ ctx, input }) => {
    return createGoal(toServiceCtx(ctx), input);
  }),

  update: coachProcedure.input(updateGoalInput).mutation(({ ctx, input }) => {
    return updateGoal(toServiceCtx(ctx), input);
  }),

  delete: coachProcedure.input(deleteGoalInput).mutation(({ ctx, input }) => {
    return deleteGoal(toServiceCtx(ctx), input);
  }),

  listForPlayer: coachProcedure
    .input(listPlayerGoalsInput)
    .query(({ ctx, input }) => {
      return listPlayerGoals(toServiceCtx(ctx), input);
    }),

  rosterSummary: coachProcedure.query(({ ctx }) => {
    return getRosterGoalSummary(toServiceCtx(ctx));
  }),

  setStatus: protectedProcedure
    .input(setGoalStatusInput)
    .mutation(({ ctx, input }) => {
      return setGoalStatus(toServiceCtx(ctx), input);
    }),

  listMine: protectedProcedure
    .input(listMyGoalsInput)
    .query(({ ctx, input }) => {
      return listMyGoals(toServiceCtx(ctx), input);
    }),

  updateProgress: protectedProcedure
    .input(updateGoalProgressInput)
    .mutation(({ ctx, input }) => {
      return updateGoalProgress(toServiceCtx(ctx), input);
    }),
} satisfies TRPCRouterRecord;
