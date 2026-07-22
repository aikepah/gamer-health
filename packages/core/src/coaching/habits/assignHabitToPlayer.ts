import { z } from "zod/v4";

import type { HabitConfig } from "@gamer-health/db/schema";
import { Habit, HabitConfigSchema } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { assertCoachOf } from "../../authz/assertCoachOf";
import { validateHabitConfig } from "../../habits/validateHabitConfig";
import { requireUserId } from "../../lib/auth";
import { CoreError } from "../../lib/errors";
import { listAssignableHabitDefinitions } from "./listAssignableHabitDefinitions";

export const assignHabitToPlayerInput = z.object({
  playerUserId: z.string().min(1),
  definitionId: z.uuid(),
  config: HabitConfigSchema.optional(),
});
export type AssignHabitToPlayerInput = z.infer<typeof assignHabitToPlayerInput>;

export type HabitRow = typeof Habit.$inferSelect;

/**
 * Assigns a habit definition to a roster player (#14). Upserts on the
 * (userId, definitionId) unique index — if the player already has an
 * instance (self-adopted, or assigned by a previous coach), assignment
 * takes it over: enables it, applies the coach's config, and stamps
 * `assignedByUserId`. This is an explicit act by someone the player chose
 * as their coach, so overwriting prior provenance is intended, not a race.
 */
export async function assignHabitToPlayer(
  ctx: ServiceCtx,
  input: AssignHabitToPlayerInput,
): Promise<HabitRow> {
  await assertCoachOf(ctx, input.playerUserId);
  const coachUserId = requireUserId(ctx);

  const assignable = await listAssignableHabitDefinitions(ctx);
  const definition = assignable.find((d) => d.id === input.definitionId);
  if (!definition) {
    throw new CoreError("NOT_FOUND", "Habit definition not found");
  }

  const config: HabitConfig = { ...definition.defaultConfig, ...input.config };
  validateHabitConfig(definition.triggerType, config);

  const [row] = await ctx.db
    .insert(Habit)
    .values({
      userId: input.playerUserId,
      definitionId: definition.id,
      enabled: true,
      config,
      assignedByUserId: coachUserId,
    })
    .onConflictDoUpdate({
      target: [Habit.userId, Habit.definitionId],
      set: { enabled: true, config, assignedByUserId: coachUserId },
    })
    .returning();
  if (!row) {
    throw new CoreError("CONFLICT", "Failed to assign habit");
  }
  return row;
}
