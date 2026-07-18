import type { HabitDefinition } from "@gamer-health/db/schema";
import { count, inArray } from "@gamer-health/db";
import { Habit } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";

type HabitDefinitionRow = typeof HabitDefinition.$inferSelect;

export type HabitDefinitionAdminRow = HabitDefinitionRow & {
  instanceCount: number;
};

/**
 * All habit definitions (archived included) for `/admin/content`'s Default
 * habits tab, with an instance count per definition (drives the "delete only
 * when zero instances" rule). Ordered: active first, then title.
 */
export async function listHabitDefinitionsAdmin(
  ctx: ServiceCtx,
): Promise<HabitDefinitionAdminRow[]> {
  await requireRole(ctx, ["admin"]);

  const defs = await ctx.db.query.HabitDefinition.findMany();
  const defIds = defs.map((d) => d.id);

  const instanceAgg =
    defIds.length > 0
      ? await ctx.db
          .select({ definitionId: Habit.definitionId, value: count() })
          .from(Habit)
          .where(inArray(Habit.definitionId, defIds))
          .groupBy(Habit.definitionId)
      : [];
  const instanceCountByDef = new Map(
    instanceAgg.map((r) => [r.definitionId, r.value]),
  );

  const rows = defs.map((d) => ({
    ...d,
    instanceCount: instanceCountByDef.get(d.id) ?? 0,
  }));

  rows.sort((a, b) => {
    const aArchived = a.archivedAt !== null;
    const bArchived = b.archivedAt !== null;
    if (aArchived !== bArchived) return aArchived ? 1 : -1;
    return a.title.localeCompare(b.title);
  });

  return rows;
}
