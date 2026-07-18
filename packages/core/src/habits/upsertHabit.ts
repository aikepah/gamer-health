import { z } from "zod/v4";

import type { HabitConfig } from "@gamer-health/db/schema";
import { and, eq } from "@gamer-health/db";
import {
  Habit,
  HabitConfigSchema,
  HabitDefinition,
} from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { requireUserId } from "../lib/auth";
import { CoreError } from "../lib/errors";
import { validateHabitConfig } from "./validateHabitConfig";

export const upsertHabitInput = z.object({
  definitionId: z.uuid(),
  enabled: z.boolean(),
  config: HabitConfigSchema.optional(),
});
export type UpsertHabitInput = z.infer<typeof upsertHabitInput>;

export type HabitRow = typeof Habit.$inferSelect;

/**
 * Enables/disables and configures a habit definition for the caller. Upserts
 * on the (userId, definitionId) unique index. `triggerType` always comes
 * from the definition row — never client-supplied.
 */
export async function upsertHabit(
  ctx: ServiceCtx,
  input: UpsertHabitInput,
): Promise<HabitRow> {
  const userId = requireUserId(ctx);

  const definition = await ctx.db.query.HabitDefinition.findFirst({
    where: eq(HabitDefinition.id, input.definitionId),
  });
  if (!definition) {
    throw new CoreError("NOT_FOUND", "Habit definition not found");
  }

  const existing = await ctx.db.query.Habit.findFirst({
    where: and(
      eq(Habit.userId, userId),
      eq(Habit.definitionId, input.definitionId),
    ),
  });

  // Visible = in the default catalog, or the caller already has an instance
  // (covers a definition since archived or turned non-default).
  if (!definition.isDefault && !existing) {
    throw new CoreError("NOT_FOUND", "Habit definition not found");
  }
  // Archived definitions can't gain new instances, but existing ones keep working.
  if (definition.archivedAt && !existing) {
    throw new CoreError("BAD_REQUEST", "This habit is no longer available");
  }

  const config: HabitConfig = { ...definition.defaultConfig, ...input.config };
  validateHabitConfig(definition.triggerType, config);

  const [row] = await ctx.db
    .insert(Habit)
    .values({
      userId,
      definitionId: input.definitionId,
      enabled: input.enabled,
      config,
    })
    .onConflictDoUpdate({
      target: [Habit.userId, Habit.definitionId],
      set: { enabled: input.enabled, config },
    })
    .returning();
  if (!row) {
    throw new CoreError("CONFLICT", "Failed to save habit");
  }
  return row;
}
