import type { TRPCRouterRecord } from "@trpc/server";

import {
  assignHabitToPlayer,
  assignHabitToPlayerInput,
  createCoachHabitDefinition,
  createCoachHabitDefinitionInput,
  listAssignableHabitDefinitions,
  listCoachHabitDefinitions,
  listPlayerHabitsForCoach,
  listPlayerHabitsForCoachInput,
  setCoachHabitDefinitionArchived,
  setCoachHabitDefinitionArchivedInput,
  unassignHabitFromPlayer,
  unassignHabitFromPlayerInput,
  updateCoachHabitDefinition,
  updateCoachHabitDefinitionInput,
} from "@gamer-health/core";

import { coachProcedure, toServiceCtx } from "../../trpc";

/**
 * Coach habit assignment (#14): a coach's own habit-definition library plus
 * assigning/unassigning habits on roster players. All logic lives in
 * `packages/core/src/coaching/habits/*` — see
 * docs/features/coach-habit-assignment.md. The player-side experience
 * (enable/disable, reconfigure, view "Assigned by") reuses the existing
 * `habit.list` / `habit.upsert` routes — no new player-side routes here.
 */
export const assignedHabitsRouter = {
  listDefinitions: coachProcedure.query(({ ctx }) => {
    return listCoachHabitDefinitions(toServiceCtx(ctx));
  }),

  createDefinition: coachProcedure
    .input(createCoachHabitDefinitionInput)
    .mutation(({ ctx, input }) => {
      return createCoachHabitDefinition(toServiceCtx(ctx), input);
    }),

  updateDefinition: coachProcedure
    .input(updateCoachHabitDefinitionInput)
    .mutation(({ ctx, input }) => {
      return updateCoachHabitDefinition(toServiceCtx(ctx), input);
    }),

  setDefinitionArchived: coachProcedure
    .input(setCoachHabitDefinitionArchivedInput)
    .mutation(({ ctx, input }) => {
      return setCoachHabitDefinitionArchived(toServiceCtx(ctx), input);
    }),

  listAssignable: coachProcedure.query(({ ctx }) => {
    return listAssignableHabitDefinitions(toServiceCtx(ctx));
  }),

  listPlayerHabits: coachProcedure
    .input(listPlayerHabitsForCoachInput)
    .query(({ ctx, input }) => {
      return listPlayerHabitsForCoach(toServiceCtx(ctx), input);
    }),

  assign: coachProcedure
    .input(assignHabitToPlayerInput)
    .mutation(({ ctx, input }) => {
      return assignHabitToPlayer(toServiceCtx(ctx), input);
    }),

  unassign: coachProcedure
    .input(unassignHabitFromPlayerInput)
    .mutation(({ ctx, input }) => {
      return unassignHabitFromPlayer(toServiceCtx(ctx), input);
    }),
} satisfies TRPCRouterRecord;
