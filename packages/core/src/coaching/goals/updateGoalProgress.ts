import { z } from "zod/v4";

import { and, eq } from "@gamer-health/db";
import { Goal } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import type { GoalRow } from "./common";
import { requireActiveUser } from "../../authz/requireRole";
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
  // `requireActiveUser`, not `requireUserId`: the latter only checks that a
  // session exists and never loads the profile, so a deactivated player
  // could still write here while every sibling goal service refused them.
  const { userId } = await requireActiveUser(ctx);

  const goal = await ctx.db.query.Goal.findFirst({
    where: eq(Goal.id, input.goalId),
  });
  if (goal?.playerUserId !== userId) {
    throw new CoreError("NOT_FOUND", "Goal not found");
  }

  // Ownership is re-asserted in the WHERE rather than trusted from the read
  // above, which isn't atomic with this write — same conditional-update
  // pattern as `withdrawApplication`.
  const [updated] = await ctx.db
    .update(Goal)
    .set({ progressNote: input.progressNote })
    .where(and(eq(Goal.id, input.goalId), eq(Goal.playerUserId, userId)))
    .returning();
  if (!updated) {
    throw new CoreError("NOT_FOUND", "Goal not found");
  }
  return updated;
}
