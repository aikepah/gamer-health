import { z } from "zod/v4";

import type { HabitConfig } from "@gamer-health/db/schema";
import type { HabitTriggerType } from "@gamer-health/validators";
import { eq } from "@gamer-health/db";
import { Habit } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { assertCoachOf } from "../../authz/assertCoachOf";
import { queryHabitCompletionRaw } from "../../habits/queryHabitCompletionRaw";
import { requireUserId } from "../../lib/auth";

export const listPlayerHabitsForCoachInput = z.object({
  playerUserId: z.string().min(1),
  days: z.number().int().min(1).max(90).default(7),
});
export type ListPlayerHabitsForCoachInput = z.infer<
  typeof listPlayerHabitsForCoachInput
>;

export interface CoachPlayerHabitRow {
  habitId: string;
  definitionId: string;
  title: string;
  triggerType: HabitTriggerType;
  config: HabitConfig;
  enabled: boolean;
  /** True when the CALLING coach is the one who assigned this habit. */
  assignedByMe: boolean;
  /** Null = self-adopted; may belong to a different (e.g. former) coach. */
  assignedByUserId: string | null;
  /**
   * Whether the underlying definition is coach-custom (`isDefault: false`).
   * Drives the unassign UI's copy: unassigning a custom definition also
   * pauses it for the player (it's not in their visible catalog otherwise),
   * while a default-catalog habit just reverts to self-adopted.
   */
  isDefaultDefinition: boolean;
  /** Completed prompts in the last `days` days. */
  done: number;
  /** All non-pending prompts (done + skipped + expired) in the last `days` days. */
  total: number;
}

/**
 * A roster player's full habit list for the coach's player-detail panel
 * (#14): every habit instance the player has — self-adopted or
 * assigned — with source and a 7-day (default) completion rate. Gated by
 * `assertCoachOf`, so this is invisible once the coaching relationship
 * ends, even though the underlying `habit` rows keep working
 * (docs/features/coach-habit-assignment.md).
 */
export async function listPlayerHabitsForCoach(
  ctx: ServiceCtx,
  input: ListPlayerHabitsForCoachInput,
): Promise<CoachPlayerHabitRow[]> {
  await assertCoachOf(ctx, input.playerUserId);
  const coachUserId = requireUserId(ctx);

  const habits = await ctx.db.query.Habit.findMany({
    where: eq(Habit.userId, input.playerUserId),
    with: { definition: true },
  });

  const completionRows = await queryHabitCompletionRaw(ctx, {
    userId: input.playerUserId,
    days: input.days,
  });
  const completionByHabit = new Map<string, { done: number; total: number }>();
  for (const row of completionRows) {
    const entry = completionByHabit.get(row.habitId) ?? {
      done: 0,
      total: 0,
    };
    entry.total += row.count;
    if (row.status === "done") entry.done += row.count;
    completionByHabit.set(row.habitId, entry);
  }

  return habits.map((h) => {
    const completion = completionByHabit.get(h.id) ?? { done: 0, total: 0 };
    return {
      habitId: h.id,
      definitionId: h.definitionId,
      title: h.definition.title,
      triggerType: h.definition.triggerType,
      config: h.config,
      enabled: h.enabled,
      assignedByMe: h.assignedByUserId === coachUserId,
      assignedByUserId: h.assignedByUserId,
      isDefaultDefinition: h.definition.isDefault,
      done: completion.done,
      total: completion.total,
    };
  });
}
