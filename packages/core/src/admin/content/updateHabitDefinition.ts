import { z } from "zod/v4";

import { eq } from "@gamer-health/db";
import { HabitConfigSchema, HabitDefinition } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { validateHabitConfig } from "../../habits/validateHabitConfig";
import { CoreError } from "../../lib/errors";
import { recordAdminAudit } from "../audit";

type HabitDefinitionRow = typeof HabitDefinition.$inferSelect;

export const updateHabitDefinitionInput = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(1000).optional(),
  promptText: z.string().trim().min(1).max(200).optional(),
  defaultConfig: HabitConfigSchema.optional(),
});
export type UpdateHabitDefinitionInput = z.infer<
  typeof updateHabitDefinitionInput
>;

/**
 * Edits a habit definition's editable fields. `triggerType` and `slug` are
 * immutable after creation (see docs/features/admin-content.md), so this
 * never touches them — a given `defaultConfig` is validated against the
 * row's existing `triggerType`. Built-ins (slug != null) are editable here;
 * only delete is blocked for them.
 */
export async function updateHabitDefinition(
  ctx: ServiceCtx,
  input: UpdateHabitDefinitionInput,
): Promise<HabitDefinitionRow> {
  const actor = await requireRole(ctx, ["admin"]);

  const existing = await ctx.db.query.HabitDefinition.findFirst({
    where: eq(HabitDefinition.id, input.id),
  });
  if (!existing) {
    throw new CoreError("NOT_FOUND", "Habit definition not found");
  }

  if (input.defaultConfig) {
    validateHabitConfig(existing.triggerType, input.defaultConfig);
  }

  const fields: string[] = [];
  const set: Partial<
    Pick<
      HabitDefinitionRow,
      "title" | "description" | "promptText" | "defaultConfig"
    >
  > = {};
  if (input.title !== undefined) {
    set.title = input.title;
    fields.push("title");
  }
  if (input.description !== undefined) {
    set.description = input.description;
    fields.push("description");
  }
  if (input.promptText !== undefined) {
    set.promptText = input.promptText;
    fields.push("promptText");
  }
  if (input.defaultConfig !== undefined) {
    set.defaultConfig = input.defaultConfig;
    fields.push("defaultConfig");
  }

  if (fields.length === 0) {
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

  await recordAdminAudit(ctx.db, {
    actorUserId: actor.userId,
    action: "habit_def_update",
    meta: { fields },
  });

  return row;
}
