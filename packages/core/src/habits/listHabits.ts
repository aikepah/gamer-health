import type { HabitConfig } from "@gamer-health/db/schema";
import type { HabitTriggerType } from "@gamer-health/validators";
import { and, eq, isNull } from "@gamer-health/db";
import { Habit, HabitDefinition } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { requireUserId } from "../lib/auth";

type HabitDefinitionRow = typeof HabitDefinition.$inferSelect;

export interface ListHabitsItem {
  definitionId: string;
  slug: string | null;
  title: string;
  description: string;
  promptText: string;
  triggerType: HabitTriggerType;
  /** True when this definition has been soft-retired from the adopt list. */
  archived: boolean;
  /** false when the caller has no instance of this definition yet. */
  enabled: boolean;
  /** The caller's saved config, else the definition's default. */
  config: HabitConfig;
  habitId: string | null;
  /** Always null until #14 (coach-assigned habits). */
  assignedByUserId: string | null;
}

/**
 * The player-visible habit catalog (docs/features/habit-generalization.md):
 * every default, non-archived definition, plus any definition the caller
 * already has an instance of (even if archived or since made non-default).
 * Order: enabled instances first, then the rest by title.
 */
export async function listHabits(ctx: ServiceCtx): Promise<ListHabitsItem[]> {
  const userId = requireUserId(ctx);

  const instances = await ctx.db.query.Habit.findMany({
    where: eq(Habit.userId, userId),
    with: { definition: true },
  });
  const instanceByDefinitionId = new Map(
    instances.map((row) => [row.definitionId, row]),
  );

  const catalogDefs = await ctx.db.query.HabitDefinition.findMany({
    where: and(
      eq(HabitDefinition.isDefault, true),
      isNull(HabitDefinition.archivedAt),
    ),
  });

  const defsById = new Map<string, HabitDefinitionRow>();
  for (const def of catalogDefs) {
    defsById.set(def.id, def);
  }
  for (const row of instances) {
    defsById.set(row.definition.id, row.definition);
  }

  const items: ListHabitsItem[] = Array.from(defsById.values()).map((def) => {
    const instance = instanceByDefinitionId.get(def.id);
    return {
      definitionId: def.id,
      slug: def.slug,
      title: def.title,
      description: def.description,
      promptText: def.promptText,
      triggerType: def.triggerType,
      archived: def.archivedAt !== null,
      enabled: instance?.enabled ?? false,
      config: instance?.config ?? def.defaultConfig,
      habitId: instance?.id ?? null,
      assignedByUserId: instance?.assignedByUserId ?? null,
    };
  });

  items.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  return items;
}
