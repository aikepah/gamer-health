import { z } from "zod/v4";

import { and, eq } from "@gamer-health/db";
import { Goal } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { assertCoachOf } from "../../authz/assertCoachOf";
import { CoreError } from "../../lib/errors";

export const deleteGoalInput = z.object({ goalId: z.uuid() });
export type DeleteGoalInput = z.infer<typeof deleteGoalInput>;

/**
 * Coach-only, and only while the goal is still `open` — a completed or
 * abandoned goal is history the player keeps, not something the coach can
 * erase. The delete is conditional on `status = 'open'` (checked again at
 * the DB, not just from the row we read) so a status change racing this
 * delete can't slip a non-open goal through; zero rows back is CONFLICT.
 */
export async function deleteGoal(
  ctx: ServiceCtx,
  input: DeleteGoalInput,
): Promise<void> {
  const goal = await ctx.db.query.Goal.findFirst({
    where: eq(Goal.id, input.goalId),
  });
  if (!goal) {
    throw new CoreError("NOT_FOUND", "Goal not found");
  }
  await assertCoachOf(ctx, goal.playerUserId);

  const [deleted] = await ctx.db
    .delete(Goal)
    .where(and(eq(Goal.id, input.goalId), eq(Goal.status, "open")))
    .returning({ id: Goal.id });
  if (!deleted) {
    throw new CoreError("CONFLICT", "Completed goals can't be deleted");
  }
}
