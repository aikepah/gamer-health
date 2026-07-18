import type { HabitConfig } from "@gamer-health/db/schema";
import type { HabitTriggerType } from "@gamer-health/validators";

import { CoreError } from "../lib/errors";

/**
 * Validates that `config` has the fields required by `triggerType`. Throws
 * `CoreError("BAD_REQUEST")` naming the missing key(s). The prompt engine and
 * habit upsert both switch on `triggerType` alone (no per-definition special
 * cases) — see docs/features/habit-generalization.md.
 */
export function validateHabitConfig(
  triggerType: HabitTriggerType,
  config: HabitConfig,
): void {
  if (triggerType === "session_interval") {
    if (typeof config.intervalMinutes !== "number") {
      throw new CoreError(
        "BAD_REQUEST",
        "intervalMinutes is required for this habit",
      );
    }
    return;
  }

  if (triggerType === "daily_schedule") {
    if (typeof config.timeOfDay !== "string") {
      throw new CoreError(
        "BAD_REQUEST",
        "timeOfDay is required for this habit",
      );
    }
    return;
  }

  // triggerType === "bedtime_cutoff"
  if (
    typeof config.bedtime !== "string" ||
    typeof config.leadMinutes !== "number"
  ) {
    throw new CoreError(
      "BAD_REQUEST",
      "bedtime and leadMinutes are required for this habit",
    );
  }
}
