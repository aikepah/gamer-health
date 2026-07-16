import type { TRPCRouterRecord } from "@trpc/server";

import {
  listHabits,
  respondToPrompt,
  respondToPromptInput,
  syncHabitPrompts,
  syncHabitPromptsInput,
  upsertHabit,
  upsertHabitInput,
} from "@gamer-health/core";

import { protectedProcedure, toServiceCtx } from "../trpc";

export const habitRouter = {
  list: protectedProcedure.query(({ ctx }) => {
    return listHabits(toServiceCtx(ctx));
  }),

  upsert: protectedProcedure
    .input(upsertHabitInput)
    .mutation(({ ctx, input }) => {
      return upsertHabit(toServiceCtx(ctx), input);
    }),

  // NOTE: this is a query with write side effects by design — it's the
  // generation-on-read engine (docs/features/habit-engine.md). There is no
  // background job runner; the client polls this to materialize due prompts.
  pendingPrompts: protectedProcedure
    .input(syncHabitPromptsInput)
    .query(({ ctx, input }) => {
      return syncHabitPrompts(toServiceCtx(ctx), input);
    }),

  respondPrompt: protectedProcedure
    .input(respondToPromptInput)
    .mutation(({ ctx, input }) => {
      return respondToPrompt(toServiceCtx(ctx), input);
    }),
} satisfies TRPCRouterRecord;
