import { and, eq, isNull, or } from "@gamer-health/db";
import { HabitDefinition } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { requireRole } from "../../authz/requireRole";

type HabitDefinitionRow = typeof HabitDefinition.$inferSelect;

/**
 * The exact set of definitions a coach may assign to a player: the
 * non-archived default catalog, plus their own non-archived custom
 * definitions. `assignHabitToPlayer` accepts precisely this set (else
 * `NOT_FOUND`) — kept as one helper so the UI can never offer something the
 * service would reject.
 *
 * Deviation from the spec's literal pseudocode: docs/features/coach-habit-assignment.md
 * writes the coach-owned branch as `createdByUserId = caller` with no
 * `archivedAt` check, which would leave an archived *custom* definition
 * assignable to new players forever — the opposite of what "archiving" a
 * definition is for everywhere else in the habit system (built-ins, admin
 * defaults: docs/features/habit-generalization.md). Excluding archived rows
 * from both branches keeps "archived = retired from new adoption, existing
 * instances keep working" consistent across all three definition origins.
 */
export async function listAssignableHabitDefinitions(
  ctx: ServiceCtx,
): Promise<HabitDefinitionRow[]> {
  const coach = await requireRole(ctx, ["coach"]);

  return ctx.db.query.HabitDefinition.findMany({
    where: assignableDefinitionWhere(coach.userId),
  });
}

/**
 * The single definition of "assignable by this coach", shared by the list
 * above and `assignHabitToPlayer`'s single-row lookup so the two can't drift
 * apart — same reason `publishedCoachWhere` exists for discoverability.
 */
export function assignableDefinitionWhere(coachUserId: string) {
  return and(
    isNull(HabitDefinition.archivedAt),
    or(
      eq(HabitDefinition.isDefault, true),
      eq(HabitDefinition.createdByUserId, coachUserId),
    ),
  );
}
