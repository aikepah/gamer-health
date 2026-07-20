import type { TRPCRouterRecord } from "@trpc/server";

import {
  getCoachAvailability,
  getCoachAvailabilityInput,
  getOrCreateCoachProfile,
  getPublicCoachProfile,
  getPublicCoachProfileInput,
  setCoachAcceptingApplications,
  setCoachAcceptingApplicationsInput,
  setCoachAvailability,
  setCoachAvailabilityInput,
  setCoachGames,
  setCoachGamesInput,
  setCoachPublished,
  setCoachPublishedInput,
  updateCoachProfile,
  updateCoachProfileInput,
} from "@gamer-health/core";

import { coachProcedure, protectedProcedure, toServiceCtx } from "../../trpc";

export const profileRouter = {
  getMine: coachProcedure.query(({ ctx }) => {
    return getOrCreateCoachProfile(toServiceCtx(ctx));
  }),

  update: coachProcedure
    .input(updateCoachProfileInput)
    .mutation(({ ctx, input }) => {
      return updateCoachProfile(toServiceCtx(ctx), input);
    }),

  setGames: coachProcedure
    .input(setCoachGamesInput)
    .mutation(({ ctx, input }) => {
      return setCoachGames(toServiceCtx(ctx), input);
    }),

  setAvailability: coachProcedure
    .input(setCoachAvailabilityInput)
    .mutation(({ ctx, input }) => {
      return setCoachAvailability(toServiceCtx(ctx), input);
    }),

  setPublished: coachProcedure
    .input(setCoachPublishedInput)
    .mutation(({ ctx, input }) => {
      return setCoachPublished(toServiceCtx(ctx), input);
    }),

  setAccepting: coachProcedure
    .input(setCoachAcceptingApplicationsInput)
    .mutation(({ ctx, input }) => {
      return setCoachAcceptingApplications(toServiceCtx(ctx), input);
    }),

  getPublic: protectedProcedure
    .input(getPublicCoachProfileInput)
    .query(({ ctx, input }) => {
      return getPublicCoachProfile(toServiceCtx(ctx), input);
    }),

  getAvailability: protectedProcedure
    .input(getCoachAvailabilityInput)
    .query(({ ctx, input }) => {
      return getCoachAvailability(toServiceCtx(ctx), input);
    }),
} satisfies TRPCRouterRecord;
