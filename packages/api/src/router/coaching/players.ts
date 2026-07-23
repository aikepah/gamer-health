import type { TRPCRouterRecord } from "@trpc/server";

import {
  getCoachPlayerOverview,
  getCoachPlayerOverviewInput,
  listCoachPlayerCheckins,
  listCoachPlayerCheckinsInput,
  listCoachPlayerSessions,
  listCoachPlayerSessionsInput,
} from "@gamer-health/core";

import { coachProcedure, toServiceCtx } from "../../trpc";

/**
 * Coach player progress tracking (#12): a read-only coach view of a roster
 * player's wellness data. All logic lives in
 * `packages/core/src/coaching/players/*` — see
 * docs/features/coach-player-tracking.md. `coachProcedure` gates "is a
 * coach"; `assertCoachOf` inside each service gates "is *this player's*
 * coach".
 */
export const playersRouter = {
  overview: coachProcedure
    .input(getCoachPlayerOverviewInput)
    .query(({ ctx, input }) => {
      return getCoachPlayerOverview(toServiceCtx(ctx), input);
    }),

  sessions: coachProcedure
    .input(listCoachPlayerSessionsInput)
    .query(({ ctx, input }) => {
      return listCoachPlayerSessions(toServiceCtx(ctx), input);
    }),

  checkins: coachProcedure
    .input(listCoachPlayerCheckinsInput)
    .query(({ ctx, input }) => {
      return listCoachPlayerCheckins(toServiceCtx(ctx), input);
    }),
} satisfies TRPCRouterRecord;
