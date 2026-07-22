import { count, eq, inArray } from "@gamer-health/db";
import { Habit, HabitDefinition } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";

type HabitDefinitionRow = typeof HabitDefinition.$inferSelect;

export type CoachHabitDefinitionRow = HabitDefinitionRow & {
  assignedCount: number;
};

/**
 * The coach's own habit-definition library for `/coach/habits` (#14):
 * everything they authored (active and archived), each with how many
 * players currently have an instance of it (one grouped query, not N+1).
 * Ordered: active first, then title.
 */
export async function listCoachHabitDefinitions(
  ctx: ServiceCtx,
): Promise<CoachHabitDefinitionRow[]> {
  const coach = await requireRole(ctx, ["coach"]);

  const defs = await ctx.db.query.HabitDefinition.findMany({
    where: eq(HabitDefinition.createdByUserId, coach.userId),
  });
  const defIds = defs.map((d) => d.id);

  const assignedAgg =
    defIds.length > 0
      ? await ctx.db
          .select({ definitionId: Habit.definitionId, value: count() })
          .from(Habit)
          .where(inArray(Habit.definitionId, defIds))
          .groupBy(Habit.definitionId)
      : [];
  const assignedCountByDef = new Map(
    assignedAgg.map((r) => [r.definitionId, r.value]),
  );

  const rows = defs.map((d) => ({
    ...d,
    assignedCount: assignedCountByDef.get(d.id) ?? 0,
  }));

  rows.sort((a, b) => {
    const aArchived = a.archivedAt !== null;
    const bArchived = b.archivedAt !== null;
    if (aArchived !== bArchived) return aArchived ? 1 : -1;
    return a.title.localeCompare(b.title);
  });

  return rows;
}
