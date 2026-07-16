import type { TRPCRouterRecord } from "@trpc/server";

import {
  getOrCreateGame,
  getOrCreateGameInput,
  searchGames,
  searchGamesInput,
} from "@gamer-health/core";

import { protectedProcedure, toServiceCtx } from "../trpc";

export const gameRouter = {
  search: protectedProcedure.input(searchGamesInput).query(({ ctx, input }) => {
    return searchGames(toServiceCtx(ctx), input);
  }),

  getOrCreate: protectedProcedure
    .input(getOrCreateGameInput)
    .mutation(({ ctx, input }) => {
      return getOrCreateGame(toServiceCtx(ctx), input);
    }),
} satisfies TRPCRouterRecord;
