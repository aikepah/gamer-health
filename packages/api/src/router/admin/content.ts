import type { TRPCRouterRecord } from "@trpc/server";

import {
  createHabitDefinition,
  createHabitDefinitionInput,
  deleteGame,
  deleteGameInput,
  deleteHabitDefinition,
  deleteHabitDefinitionInput,
  listGamesAdmin,
  listGamesAdminInput,
  listHabitDefinitionsAdmin,
  mergeGames,
  mergeGamesInput,
  renameGame,
  renameGameInput,
  setHabitDefinitionArchived,
  setHabitDefinitionArchivedInput,
  updateHabitDefinition,
  updateHabitDefinitionInput,
} from "@gamer-health/core";

import { adminProcedure, toServiceCtx } from "../../trpc";

export const contentRouter = {
  listGames: adminProcedure
    .input(listGamesAdminInput)
    .query(({ ctx, input }) => {
      return listGamesAdmin(toServiceCtx(ctx), input);
    }),

  renameGame: adminProcedure
    .input(renameGameInput)
    .mutation(({ ctx, input }) => {
      return renameGame(toServiceCtx(ctx), input);
    }),

  mergeGames: adminProcedure
    .input(mergeGamesInput)
    .mutation(({ ctx, input }) => {
      return mergeGames(toServiceCtx(ctx), input);
    }),

  deleteGame: adminProcedure
    .input(deleteGameInput)
    .mutation(({ ctx, input }) => {
      return deleteGame(toServiceCtx(ctx), input);
    }),

  listHabitDefinitions: adminProcedure.query(({ ctx }) => {
    return listHabitDefinitionsAdmin(toServiceCtx(ctx));
  }),

  createHabitDefinition: adminProcedure
    .input(createHabitDefinitionInput)
    .mutation(({ ctx, input }) => {
      return createHabitDefinition(toServiceCtx(ctx), input);
    }),

  updateHabitDefinition: adminProcedure
    .input(updateHabitDefinitionInput)
    .mutation(({ ctx, input }) => {
      return updateHabitDefinition(toServiceCtx(ctx), input);
    }),

  setHabitDefinitionArchived: adminProcedure
    .input(setHabitDefinitionArchivedInput)
    .mutation(({ ctx, input }) => {
      return setHabitDefinitionArchived(toServiceCtx(ctx), input);
    }),

  deleteHabitDefinition: adminProcedure
    .input(deleteHabitDefinitionInput)
    .mutation(({ ctx, input }) => {
      return deleteHabitDefinition(toServiceCtx(ctx), input);
    }),
} satisfies TRPCRouterRecord;
