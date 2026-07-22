import { z } from "zod/v4";

import { and, eq } from "@gamer-health/db";
import { Goal } from "@gamer-health/db/schema";
import { GOAL_STATUSES } from "@gamer-health/validators";

import type { ServiceCtx } from "../../ctx";
import type { GoalRow } from "./common";
import { assertCoachOf } from "../../authz/assertCoachOf";
import { requireActiveUser } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";

export const setGoalStatusInput = z.object({
  goalId: z.uuid(),
  status: z.enum(GOAL_STATUSES),
});
export type SetGoalStatusInput = z.infer<typeof setGoalStatusInput>;

/**
 * Either side of the coaching relationship can change a goal's status
 * (#13) — the player marking their own progress, or a coach closing it out
 * during a session. Authorized if the caller IS the goal's player, OR
 * `assertCoachOf` succeeds for it; a failed coach check is rethrown as a
 * bare FORBIDDEN so the caller can't tell which branch failed (no leaking
 * "you're not their coach" vs "this isn't your goal").
 *
 * `closedAt` mirrors status (DB-checked): null while `open`, set to now the
 * moment it leaves `open`, cleared again on reopen. The update is
 * conditional on the status we just read — zero rows back means someone
 * else changed it between our read and write, which is a real CONFLICT, not
 * a bug to paper over.
 */
export async function setGoalStatus(
  ctx: ServiceCtx,
  input: SetGoalStatusInput,
): Promise<GoalRow> {
  const authz = await requireActiveUser(ctx);

  const goal = await ctx.db.query.Goal.findFirst({
    where: eq(Goal.id, input.goalId),
  });
  if (!goal) {
    throw new CoreError("NOT_FOUND", "Goal not found");
  }

  if (goal.playerUserId !== authz.userId) {
    try {
      await assertCoachOf(ctx, goal.playerUserId);
    } catch (err) {
      // Only an authorization failure is flattened to a bare FORBIDDEN, so
      // the caller can't tell "not your goal" from "not their coach".
      // Anything else — a DB blip, a bug inside assertCoachOf — must
      // propagate, or real failures get misreported as permission errors.
      if (err instanceof CoreError && err.code === "FORBIDDEN") {
        throw new CoreError("FORBIDDEN");
      }
      throw err;
    }
  }

  if (goal.status === input.status) {
    return goal;
  }

  const [updated] = await ctx.db
    .update(Goal)
    .set({
      status: input.status,
      closedAt: input.status === "open" ? null : new Date(),
    })
    .where(and(eq(Goal.id, input.goalId), eq(Goal.status, goal.status)))
    .returning();
  if (!updated) {
    throw new CoreError(
      "CONFLICT",
      "This goal was already updated — refresh and try again",
    );
  }
  return updated;
}
