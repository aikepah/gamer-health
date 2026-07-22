import { z } from "zod/v4";

import { eq } from "@gamer-health/db";
import { Goal } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import type { GoalRow } from "./common";
import { requireUserId } from "../../lib/auth";
import { CoreError } from "../../lib/errors";
import { nullableText } from "./common";

export const updateGoalProgressInput = z.object({
  goalId: z.uuid(),
  progressNote: nullableText(2000),
});
export type UpdateGoalProgressInput = z.infer<typeof updateGoalProgressInput>;

/**
 * Player-only: the free-text progress note is the player's own running
 * commentary on a goal, never the coach's. `goal.playerUserId` must equal
 * the caller — anyone else (including the assigning coach) gets NOT_FOUND,
 * matching the "a player cannot touch another player's goal" acceptance
 * criterion (this endpoint has no coach branch at all).
 */
export async function updateGoalProgress(
  ctx: ServiceCtx,
  input: UpdateGoalProgressInput,
): Promise<GoalRow> {
  const userId = requireUserId(ctx);

  const goal = await ctx.db.query.Goal.findFirst({
    where: eq(Goal.id, input.goalId),
  });
  if (goal?.playerUserId !== userId) {
    throw new CoreError("NOT_FOUND", "Goal not found");
  }

  const [updated] = await ctx.db
    .update(Goal)
    .set({ progressNote: input.progressNote })
    .where(eq(Goal.id, input.goalId))
    .returning();
  if (!updated) {
    throw new CoreError("NOT_FOUND", "Goal not found");
  }
  return updated;
}
