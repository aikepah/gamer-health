import { z } from "zod/v4";

import { count, eq } from "@gamer-health/db";
import { HabitConfigSchema, HabitDefinition } from "@gamer-health/db/schema";
import { HABIT_TRIGGER_TYPES } from "@gamer-health/validators";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { validateHabitConfig } from "../../habits/validateHabitConfig";
import { CoreError } from "../../lib/errors";

type HabitDefinitionRow = typeof HabitDefinition.$inferSelect;

/** Sanity bound so one coach can't spam an unbounded definition library. */
const MAX_COACH_DEFINITIONS = 50;

export const createCoachHabitDefinitionInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  promptText: z.string().trim().min(1).max(200),
  triggerType: z.enum(HABIT_TRIGGER_TYPES),
  defaultConfig: HabitConfigSchema.default({}),
});
export type CreateCoachHabitDefinitionInput = z.infer<
  typeof createCoachHabitDefinitionInput
>;

/**
 * Creates a coach-authored habit definition (#14): out-of-catalog, never
 * offered to every player (`isDefault: false`) — only assignable by this
 * coach via `assignHabitToPlayer`. See docs/features/coach-habit-assignment.md.
 */
export async function createCoachHabitDefinition(
  ctx: ServiceCtx,
  input: CreateCoachHabitDefinitionInput,
): Promise<HabitDefinitionRow> {
  const coach = await requireRole(ctx, ["coach"]);

  validateHabitConfig(input.triggerType, input.defaultConfig);

  const [existingCount] = await ctx.db
    .select({ value: count() })
    .from(HabitDefinition)
    .where(eq(HabitDefinition.createdByUserId, coach.userId));
  if ((existingCount?.value ?? 0) >= MAX_COACH_DEFINITIONS) {
    throw new CoreError(
      "CONFLICT",
      `You've reached the ${MAX_COACH_DEFINITIONS} habit definition limit`,
    );
  }

  const [row] = await ctx.db
    .insert(HabitDefinition)
    .values({
      slug: null,
      title: input.title,
      description: input.description,
      promptText: input.promptText,
      triggerType: input.triggerType,
      defaultConfig: input.defaultConfig,
      isDefault: false,
      createdByUserId: coach.userId,
    })
    .returning();
  if (!row) {
    throw new CoreError("CONFLICT", "Failed to create habit definition");
  }

  return row;
}
