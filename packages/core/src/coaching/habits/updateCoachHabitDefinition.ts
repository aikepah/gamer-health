import { z } from "zod/v4";

import { eq } from "@gamer-health/db";
import { HabitConfigSchema, HabitDefinition } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { validateHabitConfig } from "../../habits/validateHabitConfig";
import { CoreError } from "../../lib/errors";

type HabitDefinitionRow = typeof HabitDefinition.$inferSelect;

export const updateCoachHabitDefinitionInput = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  promptText: z.string().trim().min(1).max(200).optional(),
  defaultConfig: HabitConfigSchema.optional(),
});
export type UpdateCoachHabitDefinitionInput = z.infer<
  typeof updateCoachHabitDefinitionInput
>;

/**
 * Edits a coach's own habit definition. `triggerType` is immutable after
 * creation (same rule as the admin default catalog — see
 * docs/features/admin-content.md), so a supplied `defaultConfig` is always
 * validated against the row's existing `triggerType`.
 *
 * Ownership: only the coach who created the definition may edit it, and
 * only a non-default (coach-custom) definition — a coach never edits an
 * admin/built-in default via this path.
 */
export async function updateCoachHabitDefinition(
  ctx: ServiceCtx,
  input: UpdateCoachHabitDefinitionInput,
): Promise<HabitDefinitionRow> {
  const coach = await requireRole(ctx, ["coach"]);

  const existing = await ctx.db.query.HabitDefinition.findFirst({
    where: eq(HabitDefinition.id, input.id),
  });
  if (!existing) {
    throw new CoreError("NOT_FOUND", "Habit definition not found");
  }
  if (existing.isDefault || existing.createdByUserId !== coach.userId) {
    throw new CoreError(
      "FORBIDDEN",
      "You can only edit habit definitions you created",
    );
  }

  if (input.defaultConfig) {
    validateHabitConfig(existing.triggerType, input.defaultConfig);
  }

  const set: Partial<
    Pick<
      HabitDefinitionRow,
      "title" | "description" | "promptText" | "defaultConfig"
    >
  > = {};
  if (input.title !== undefined) set.title = input.title;
  if (input.description !== undefined) set.description = input.description;
  if (input.promptText !== undefined) set.promptText = input.promptText;
  if (input.defaultConfig !== undefined)
    set.defaultConfig = input.defaultConfig;

  if (Object.keys(set).length === 0) {
    return existing;
  }

  const [row] = await ctx.db
    .update(HabitDefinition)
    .set(set)
    .where(eq(HabitDefinition.id, input.id))
    .returning();
  if (!row) {
    throw new CoreError("NOT_FOUND", "Habit definition not found");
  }

  return row;
}
