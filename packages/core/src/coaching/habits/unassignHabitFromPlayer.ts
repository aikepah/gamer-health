import { z } from "zod/v4";

import { and, eq } from "@gamer-health/db";
import { Habit } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { assertCoachOf } from "../../authz/assertCoachOf";
import { requireUserId } from "../../lib/auth";
import { CoreError } from "../../lib/errors";

export const unassignHabitFromPlayerInput = z.object({
  habitId: z.uuid(),
});
export type UnassignHabitFromPlayerInput = z.infer<
  typeof unassignHabitFromPlayerInput
>;

/**
 * Unassigns a habit from a player (#14). Never deletes: sets
 * `assignedByUserId = null`, and additionally `enabled = false` when the
 * underlying definition is coach-custom (`isDefault = false`) — otherwise a
 * definition the player can no longer see (it's not in the default catalog)
 * would keep silently generating prompts. A previously self-adopted
 * *default* habit just reverts to self-adopted and keeps running as-is.
 * History (`habit_prompt` rows, their reward events) is never touched.
 *
 * Conditional update on `assignedByUserId` still equal to the caller: the
 * ownership read above isn't atomic with the write, so a concurrent
 * unassign (or reassignment to another coach) loses this race cleanly as a
 * `CONFLICT` instead of clobbering someone else's change.
 */
export async function unassignHabitFromPlayer(
  ctx: ServiceCtx,
  input: UnassignHabitFromPlayerInput,
): Promise<void> {
  const habit = await ctx.db.query.Habit.findFirst({
    where: eq(Habit.id, input.habitId),
    with: { definition: true },
  });
  if (!habit) {
    throw new CoreError("NOT_FOUND", "Habit not found");
  }

  // A habit belonging to a non-roster player is reported as NOT_FOUND, the
  // same as an id that doesn't exist — otherwise the two responses let a
  // coach probe which habit ids are real. Same convention as
  // `getPublicCoachProfile` and `withdrawApplication`.
  try {
    await assertCoachOf(ctx, habit.userId);
  } catch (err) {
    if (err instanceof CoreError && err.code === "FORBIDDEN") {
      throw new CoreError("NOT_FOUND", "Habit not found");
    }
    throw err;
  }
  const coachUserId = requireUserId(ctx);

  if (habit.assignedByUserId !== coachUserId) {
    throw new CoreError("CONFLICT", "This habit wasn't assigned by you");
  }

  const [updated] = await ctx.db
    .update(Habit)
    .set({
      assignedByUserId: null,
      ...(habit.definition.isDefault ? {} : { enabled: false }),
    })
    .where(and(eq(Habit.id, habit.id), eq(Habit.assignedByUserId, coachUserId)))
    .returning({ id: Habit.id });
  if (!updated) {
    throw new CoreError("CONFLICT", "This habit wasn't assigned by you");
  }
}
