import type { z } from "zod/v4";

import { and, eq } from "@gamer-health/db";
import {
  Checkin,
  CreateCheckinSchema,
  GameSession,
} from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import type { CheckinRow } from "./dailyGuard";
import { recordRewardEvent } from "../gamification/events";
import { requireUserId } from "../lib/auth";
import { CoreError, isUniqueViolation } from "../lib/errors";
import { findTodayDailyCheckin } from "./dailyGuard";

export const createCheckinInput = CreateCheckinSchema;
export type CreateCheckinInput = z.infer<typeof createCheckinInput>;

/**
 * Creates a check-in and emits `checkin_completed` (+10 XP).
 *
 * Guards (`CoreError`):
 * - `context: "daily"` — `CONFLICT` if a `daily` check-in already exists for
 *   today (profile timezone, see `findTodayDailyCheckin`).
 * - `context: "post_session"` — `BAD_REQUEST` if `sessionId` is missing,
 *   `NOT_FOUND` if the session doesn't belong to the caller, `CONFLICT` if a
 *   `post_session` check-in for that session already exists.
 */
export async function createCheckin(
  ctx: ServiceCtx,
  input: CreateCheckinInput,
): Promise<CheckinRow> {
  const userId = requireUserId(ctx);

  if (input.context === "daily") {
    const existingToday = await findTodayDailyCheckin(ctx, userId);
    if (existingToday) {
      throw new CoreError("CONFLICT", "Already checked in today");
    }
  } else {
    if (!input.sessionId) {
      throw new CoreError(
        "BAD_REQUEST",
        "sessionId is required for post_session check-ins",
      );
    }

    const session = await ctx.db.query.GameSession.findFirst({
      where: and(
        eq(GameSession.id, input.sessionId),
        eq(GameSession.userId, userId),
      ),
    });
    if (!session) {
      throw new CoreError("NOT_FOUND", "Session not found");
    }

    const existing = await ctx.db.query.Checkin.findFirst({
      where: and(
        eq(Checkin.sessionId, input.sessionId),
        eq(Checkin.context, "post_session"),
      ),
    });
    if (existing) {
      throw new CoreError(
        "CONFLICT",
        "A check-in already exists for this session",
      );
    }
  }

  let checkin: CheckinRow | undefined;
  try {
    [checkin] = await ctx.db
      .insert(Checkin)
      .values({
        userId,
        context: input.context,
        sessionId: input.context === "post_session" ? input.sessionId : null,
        mood: input.mood,
        energy: input.energy ?? null,
        sleepQuality: input.sleepQuality ?? null,
        note: input.note ?? null,
      })
      .returning();
  } catch (err) {
    // Concurrent/retried post_session create: the loser trips the partial
    // unique index (checkin_one_per_session_idx) after passing the guard.
    if (isUniqueViolation(err)) {
      throw new CoreError(
        "CONFLICT",
        "A check-in already exists for this session",
      );
    }
    throw err;
  }
  if (!checkin) {
    throw new CoreError("CONFLICT", "Failed to create check-in");
  }

  await recordRewardEvent(ctx, {
    eventType: "checkin_completed",
    sourceId: checkin.id,
  });

  return checkin;
}
