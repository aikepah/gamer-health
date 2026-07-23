import { z } from "zod/v4";

import { eq } from "@gamer-health/db";
import { Goal } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import type { GoalRow } from "./common";
import { assertCoachOf } from "../../authz/assertCoachOf";
import { CoreError } from "../../lib/errors";
import { patchableDateStringOrNull, patchableText } from "./common";

export const updateGoalInput = z.object({
  goalId: z.uuid(),
  title: z.string().trim().min(1).max(160).optional(),
  description: patchableText(2000),
  targetDate: patchableDateStringOrNull(),
});
export type UpdateGoalInput = z.infer<typeof updateGoalInput>;

/**
 * Coach-only edit of title/description/targetDate (#13). Only the keys
 * actually present in `input` are patched — `undefined` means "leave
 * alone", `null` means "clear it" (see `patchableText`/
 * `patchableDateStringOrNull`). Allowed regardless of the goal's status
 * (unlike delete, which is open-only) — editing a completed goal's title is
 * fine, e.g. to fix a typo after the fact.
 */
export async function updateGoal(
  ctx: ServiceCtx,
  input: UpdateGoalInput,
): Promise<GoalRow> {
  const goal = await ctx.db.query.Goal.findFirst({
    where: eq(Goal.id, input.goalId),
  });
  if (!goal) {
    throw new CoreError("NOT_FOUND", "Goal not found");
  }
  await assertCoachOf(ctx, goal.playerUserId);

  const patch: Partial<Pick<GoalRow, "title" | "description" | "targetDate">> =
    {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.targetDate !== undefined) patch.targetDate = input.targetDate;

  if (Object.keys(patch).length === 0) {
    return goal;
  }

  const [updated] = await ctx.db
    .update(Goal)
    .set(patch)
    .where(eq(Goal.id, input.goalId))
    .returning();
  if (!updated) {
    throw new CoreError("NOT_FOUND", "Goal not found");
  }
  return updated;
}
