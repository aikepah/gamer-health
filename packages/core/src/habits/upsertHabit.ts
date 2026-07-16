import { z } from "zod/v4";

import type { HabitConfig } from "@gamer-health/db/schema";
import { Habit, HabitConfigSchema } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import type { HabitKind } from "./definitions";
import { requireUserId } from "../lib/auth";
import { CoreError } from "../lib/errors";
import { HABIT_DEFINITIONS, habitKindSchema } from "./definitions";

export const upsertHabitInput = z.object({
  kind: habitKindSchema,
  enabled: z.boolean(),
  config: HabitConfigSchema.optional(),
});
export type UpsertHabitInput = z.infer<typeof upsertHabitInput>;

export type HabitRow = typeof Habit.$inferSelect;

/**
 * Validates that `config` has the fields required by `kind`'s trigger type.
 * Throws `CoreError("BAD_REQUEST")` when a required field is missing.
 */
function assertValidConfig(kind: HabitKind, config: HabitConfig): void {
  const { triggerType } = HABIT_DEFINITIONS[kind];

  if (triggerType === "session_interval") {
    if (typeof config.intervalMinutes !== "number") {
      throw new CoreError(
        "BAD_REQUEST",
        "intervalMinutes is required for this habit",
      );
    }
    return;
  }

  if (kind === "bedtime_cutoff") {
    if (
      typeof config.bedtime !== "string" ||
      typeof config.leadMinutes !== "number"
    ) {
      throw new CoreError(
        "BAD_REQUEST",
        "bedtime and leadMinutes are required for bedtime_cutoff",
      );
    }
    return;
  }

  // kind === "daily_movement"
  if (typeof config.timeOfDay !== "string") {
    throw new CoreError(
      "BAD_REQUEST",
      "timeOfDay is required for daily_movement",
    );
  }
}

/**
 * Enables/disables and configures a built-in habit for the caller. Upserts on
 * the (userId, kind) unique index. `triggerType` always comes from
 * `HABIT_DEFINITIONS` — never client-supplied.
 */
export async function upsertHabit(
  ctx: ServiceCtx,
  input: UpsertHabitInput,
): Promise<HabitRow> {
  const userId = requireUserId(ctx);
  const def = HABIT_DEFINITIONS[input.kind];
  const config: HabitConfig = { ...def.defaultConfig, ...input.config };
  assertValidConfig(input.kind, config);

  const [row] = await ctx.db
    .insert(Habit)
    .values({
      userId,
      kind: input.kind,
      triggerType: def.triggerType,
      enabled: input.enabled,
      config,
    })
    .onConflictDoUpdate({
      target: [Habit.userId, Habit.kind],
      set: { enabled: input.enabled, config },
    })
    .returning();
  if (!row) {
    throw new CoreError("CONFLICT", "Failed to save habit");
  }
  return row;
}
