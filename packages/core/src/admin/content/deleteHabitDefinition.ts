import { z } from "zod/v4";

import { count, eq } from "@gamer-health/db";
import { Habit, HabitDefinition } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";
import { recordAdminAudit } from "../audit";

export const deleteHabitDefinitionInput = z.object({ id: z.uuid() });
export type DeleteHabitDefinitionInput = z.infer<
  typeof deleteHabitDefinitionInput
>;

/**
 * Deletes a habit definition. Built-ins (slug != null) can never be deleted —
 * archive instead — and any definition with existing habit instances can
 * only be archived too.
 */
export async function deleteHabitDefinition(
  ctx: ServiceCtx,
  input: DeleteHabitDefinitionInput,
): Promise<void> {
  const actor = await requireRole(ctx, ["admin"]);

  const existing = await ctx.db.query.HabitDefinition.findFirst({
    where: eq(HabitDefinition.id, input.id),
  });
  if (!existing) {
    throw new CoreError("NOT_FOUND", "Habit definition not found");
  }

  if (existing.slug != null) {
    throw new CoreError(
      "CONFLICT",
      "Built-in definitions can't be deleted — archive instead",
    );
  }

  const [instanceCountRow] = await ctx.db
    .select({ value: count() })
    .from(Habit)
    .where(eq(Habit.definitionId, input.id));
  if ((instanceCountRow?.value ?? 0) > 0) {
    throw new CoreError("CONFLICT", "In use — archive instead");
  }

  await ctx.db.transaction(async (tx) => {
    await tx.delete(HabitDefinition).where(eq(HabitDefinition.id, input.id));
    await recordAdminAudit(tx, {
      actorUserId: actor.userId,
      action: "habit_def_delete",
      meta: { title: existing.title },
    });
  });
}
