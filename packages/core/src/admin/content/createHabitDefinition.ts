import { z } from "zod/v4";

import { HabitConfigSchema, HabitDefinition } from "@gamer-health/db/schema";
import { HABIT_TRIGGER_TYPES } from "@gamer-health/validators";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { validateHabitConfig } from "../../habits/validateHabitConfig";
import { CoreError } from "../../lib/errors";
import { recordAdminAudit } from "../audit";

type HabitDefinitionRow = typeof HabitDefinition.$inferSelect;

export const createHabitDefinitionInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1000),
  promptText: z.string().trim().min(1).max(200),
  triggerType: z.enum(HABIT_TRIGGER_TYPES),
  defaultConfig: HabitConfigSchema,
});
export type CreateHabitDefinitionInput = z.infer<
  typeof createHabitDefinitionInput
>;

/**
 * Creates an admin-curated default habit definition, offered to every player
 * (slug null, isDefault true, createdByUserId the acting admin).
 */
export async function createHabitDefinition(
  ctx: ServiceCtx,
  input: CreateHabitDefinitionInput,
): Promise<HabitDefinitionRow> {
  const actor = await requireRole(ctx, ["admin"]);

  validateHabitConfig(input.triggerType, input.defaultConfig);

  const [row] = await ctx.db
    .insert(HabitDefinition)
    .values({
      slug: null,
      title: input.title,
      description: input.description,
      promptText: input.promptText,
      triggerType: input.triggerType,
      defaultConfig: input.defaultConfig,
      isDefault: true,
      createdByUserId: actor.userId,
    })
    .returning();
  if (!row) {
    throw new CoreError("CONFLICT", "Failed to create habit definition");
  }

  await recordAdminAudit(ctx.db, {
    actorUserId: actor.userId,
    action: "habit_def_create",
    meta: { title: row.title },
  });

  return row;
}
