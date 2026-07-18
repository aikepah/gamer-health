import { z } from "zod/v4";

import type { StreakKind } from "@gamer-health/validators";
import { RewardEvent } from "@gamer-health/db/schema";
import {
  REWARD_EVENT_DEFS,
  rewardEventTypeSchema,
} from "@gamer-health/validators";

import type { ServiceCtx, TxDb } from "../ctx";
import type { StreakState } from "./streaks";
import { requireUserId } from "../lib/auth";
import { localDateString } from "../lib/dates";
import { getOrCreateProfile } from "../profile/getOrCreateProfile";
import { evaluateAchievements } from "./achievements";
import { bumpStreak } from "./streaks";

export const recordRewardEventInput = z.object({
  eventType: rewardEventTypeSchema,
  /** Id of the source entity (uuid) or achievement key. */
  sourceId: z.string().min(1),
  /** Only used for achievement_unlocked (xp comes from the achievement def). */
  xpOverride: z.number().int().positive().optional(),
  /**
   * Extra context consumed by the Phase 3 engine (streaks). `habitKind` is
   * `habit_definition.slug ?? null` (#8) — null for out-of-game/custom
   * habits, which earn XP but no per-habit streak.
   */
  meta: z
    .object({
      habitKind: z.string().nullable().optional(),
      definitionId: z.uuid().optional(),
    })
    .optional(),
});
export type RecordRewardEventInput = z.infer<typeof recordRewardEventInput>;

/** Streak kinds bumped by a given event (docs/features/gamification.md). */
function streakKindsFor(input: RecordRewardEventInput): StreakKind[] {
  switch (input.eventType) {
    case "checkin_completed":
      return ["daily_checkin"];
    case "habit_prompt_completed":
      return input.meta?.habitKind === "hydrate"
        ? ["daily_habit", "habit_hydrate"]
        : ["daily_habit"];
    default:
      return [];
  }
}

/**
 * Records a reward event, idempotently (unique on user+type+source), and —
 * only when a new event was actually inserted — updates streak counters and
 * evaluates achievement unlocks, all inside one transaction. A duplicate
 * emission is a no-op with no side effects.
 */
export async function recordRewardEvent(
  ctx: ServiceCtx,
  input: RecordRewardEventInput,
): Promise<{ recorded: boolean }> {
  const userId = requireUserId(ctx);
  const def = REWARD_EVENT_DEFS[input.eventType];

  // Resolved outside the transaction: it's a read-only lookup (with
  // create-if-missing) that doesn't need to be atomic with the writes below,
  // and keeping it out avoids threading the transaction's tx-scoped db type
  // through `getOrCreateProfile`'s `ServiceCtx`-shaped signature.
  const streakKinds = streakKindsFor(input);
  const today =
    streakKinds.length > 0
      ? localDateString(
          new Date(),
          (await getOrCreateProfile(ctx)).timezone ?? "UTC",
        )
      : null;

  return ctx.db.transaction(async (tx: TxDb) => {
    const rows = await tx
      .insert(RewardEvent)
      .values({
        userId,
        eventType: input.eventType,
        xp: input.xpOverride ?? def.xp,
        sourceKind: def.sourceKind,
        sourceId: input.sourceId,
      })
      .onConflictDoNothing()
      .returning({ id: RewardEvent.id });
    if (rows.length === 0) {
      return { recorded: false };
    }

    const streaks: Partial<Record<StreakKind, StreakState>> = {};
    if (today !== null) {
      for (const kind of streakKinds) {
        streaks[kind] = await bumpStreak(tx, userId, kind, today);
      }
    }

    await evaluateAchievements(tx, userId, input.eventType, streaks);

    return { recorded: true };
  });
}
