import { z } from "zod/v4";

import { RewardEvent } from "@gamer-health/db/schema";
import {
  REWARD_EVENT_DEFS,
  rewardEventTypeSchema,
} from "@gamer-health/validators";

import type { ServiceCtx } from "../ctx";
import { requireUserId } from "../lib/auth";

export const recordRewardEventInput = z.object({
  eventType: rewardEventTypeSchema,
  /** Id of the source entity (uuid) or achievement key. */
  sourceId: z.string().min(1),
  /** Only used for achievement_unlocked (xp comes from the achievement def). */
  xpOverride: z.number().int().positive().optional(),
  /** Extra context consumed by the Phase 3 engine (streaks). */
  meta: z.object({ habitKind: z.string().optional() }).optional(),
});
export type RecordRewardEventInput = z.infer<typeof recordRewardEventInput>;

/**
 * Records a reward event, idempotently (unique on user+type+source).
 * Phase 3 (gamification feature) extends this function with streak updates
 * and achievement evaluation — Phase 2 features must NOT add logic here.
 */
export async function recordRewardEvent(
  ctx: ServiceCtx,
  input: RecordRewardEventInput,
): Promise<{ recorded: boolean }> {
  const userId = requireUserId(ctx);
  const def = REWARD_EVENT_DEFS[input.eventType];
  const rows = await ctx.db
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
  return { recorded: rows.length > 0 };
}
