import { z } from "zod/v4";

import { eq } from "@gamer-health/db";
import { HabitDefinition } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";
import { recordAdminAudit } from "../audit";

type HabitDefinitionRow = typeof HabitDefinition.$inferSelect;

export const setHabitDefinitionArchivedInput = z.object({
  id: z.uuid(),
  archived: z.boolean(),
});
export type SetHabitDefinitionArchivedInput = z.infer<
  typeof setHabitDefinitionArchivedInput
>;

/**
 * Archives/unarchives a definition: removes (or restores) it from the player
 * adopt list only — existing user habits keep generating prompts either way
 * (docs/features/habit-generalization.md). No-op (no audit row) if already
 * in the requested state.
 */
export async function setHabitDefinitionArchived(
  ctx: ServiceCtx,
  input: SetHabitDefinitionArchivedInput,
): Promise<HabitDefinitionRow> {
  const actor = await requireRole(ctx, ["admin"]);

  const existing = await ctx.db.query.HabitDefinition.findFirst({
    where: eq(HabitDefinition.id, input.id),
  });
  if (!existing) {
    throw new CoreError("NOT_FOUND", "Habit definition not found");
  }

  const currentlyArchived = existing.archivedAt !== null;
  if (currentlyArchived === input.archived) {
    return existing;
  }

  const [row] = await ctx.db
    .update(HabitDefinition)
    .set({ archivedAt: input.archived ? new Date() : null })
    .where(eq(HabitDefinition.id, input.id))
    .returning();
  if (!row) {
    throw new CoreError("NOT_FOUND", "Habit definition not found");
  }

  await recordAdminAudit(ctx.db, {
    actorUserId: actor.userId,
    action: input.archived ? "habit_def_archive" : "habit_def_unarchive",
    meta: { title: row.title },
  });

  return row;
}
