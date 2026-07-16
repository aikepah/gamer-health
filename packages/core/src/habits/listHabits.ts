import type { HabitConfig } from "@gamer-health/db/schema";
import { eq } from "@gamer-health/db";
import { Habit } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import type { HabitKind } from "./definitions";
import { requireUserId } from "../lib/auth";
import { HABIT_DEFINITIONS, HABIT_KINDS } from "./definitions";

export interface ListHabitsItem {
  kind: HabitKind;
  title: string;
  description: string;
  triggerType: "session_interval" | "daily_schedule";
  /** false when the user has no row for this kind yet. */
  enabled: boolean;
  /** The user's saved config, else the kind's default. */
  config: HabitConfig;
  habitId: string | null;
}

/** Merges the fixed habit catalog with the caller's saved rows. */
export async function listHabits(ctx: ServiceCtx): Promise<ListHabitsItem[]> {
  const userId = requireUserId(ctx);

  const rows = await ctx.db.query.Habit.findMany({
    where: eq(Habit.userId, userId),
  });
  const byKind = new Map(rows.map((row) => [row.kind, row]));

  return HABIT_KINDS.map((kind) => {
    const def = HABIT_DEFINITIONS[kind];
    const row = byKind.get(kind);
    return {
      kind,
      title: def.title,
      description: def.description,
      triggerType: def.triggerType,
      enabled: row?.enabled ?? false,
      config: row?.config ?? def.defaultConfig,
      habitId: row?.id ?? null,
    };
  });
}
