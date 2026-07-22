import { z } from "zod/v4";

import { eq } from "@gamer-health/db";
import { HabitDefinition } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";

type HabitDefinitionRow = typeof HabitDefinition.$inferSelect;

export const setCoachHabitDefinitionArchivedInput = z.object({
  definitionId: z.uuid(),
  archived: z.boolean(),
});
export type SetCoachHabitDefinitionArchivedInput = z.infer<
  typeof setCoachHabitDefinitionArchivedInput
>;

/**
 * Archives/unarchives a coach's own habit definition. Same semantics as the
 * admin default catalog (docs/features/habit-generalization.md): this only
 * retires the definition from `listAssignableHabitDefinitions` (new
 * assignments), never touches existing `habit` instances — those keep
 * generating prompts either way. No-op if already in the requested state.
 */
export async function setCoachHabitDefinitionArchived(
  ctx: ServiceCtx,
  input: SetCoachHabitDefinitionArchivedInput,
): Promise<HabitDefinitionRow> {
  const coach = await requireRole(ctx, ["coach"]);

  const existing = await ctx.db.query.HabitDefinition.findFirst({
    where: eq(HabitDefinition.id, input.definitionId),
  });
  if (!existing) {
    throw new CoreError("NOT_FOUND", "Habit definition not found");
  }
  if (existing.isDefault || existing.createdByUserId !== coach.userId) {
    throw new CoreError(
      "FORBIDDEN",
      "You can only archive habit definitions you created",
    );
  }

  const currentlyArchived = existing.archivedAt !== null;
  if (currentlyArchived === input.archived) {
    return existing;
  }

  const [row] = await ctx.db
    .update(HabitDefinition)
    .set({ archivedAt: input.archived ? new Date() : null })
    .where(eq(HabitDefinition.id, input.definitionId))
    .returning();
  if (!row) {
    throw new CoreError("NOT_FOUND", "Habit definition not found");
  }

  return row;
}
