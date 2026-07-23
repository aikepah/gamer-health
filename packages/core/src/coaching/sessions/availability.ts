import { TZDate } from "@date-fns/tz";

import { MINUTES_PER_DAY } from "@gamer-health/validators";

import type { AvailabilityBlock } from "../profile/getOrCreateCoachProfile";
import { localDateString } from "../../lib/dates";

export type { AvailabilityBlock };

/** Weekday + minutes-from-local-midnight + calendar date, all in `timeZone`. */
export interface LocalSlot {
  /** 0 = Sunday … 6 = Saturday, matching `coach_availability.weekday`. */
  weekday: number;
  /** Minutes from local midnight (0–1439). */
  minute: number;
  /** "YYYY-MM-DD" wall-clock date in `timeZone`. */
  date: string;
}

/**
 * Converts `instant` into its weekday, minute-of-day, and calendar date in
 * `timeZone`. Pure wall-clock decomposition — never hand-roll offset maths,
 * `@date-fns/tz` owns that (see `lib/dates.ts`).
 */
export function toLocalSlot(instant: Date, timeZone: string): LocalSlot {
  const zoned = new TZDate(instant, timeZone);
  return {
    weekday: zoned.getDay(),
    minute: zoned.getHours() * 60 + zoned.getMinutes(),
    date: localDateString(instant, timeZone),
  };
}

/**
 * True iff `[start, end)` sits inside ONE availability block on `start`'s
 * weekday. Both endpoints must fall on the same local calendar date — EXCEPT
 * that a session ending exactly at local midnight (`end.minute === 0` on the
 * calendar day immediately after `start.date`) is treated as ending at
 * minute 1440 on `start.date`, so a block like Fri 22:00–24:00 can still be
 * booked in full. Spanning two calendar days any other way (or two adjacent
 * availability blocks) is rejected — see docs/features/coaching-sessions.md.
 */
/**
 * The shape this predicate actually reads. Narrower than `AvailabilityBlock`
 * on purpose: containment is pure wall-clock maths and never needs the row's
 * `id`, so callers (and tests) shouldn't have to invent one. A real
 * `AvailabilityBlock[]` satisfies this structurally.
 */
export type AvailabilityWindow = Omit<AvailabilityBlock, "id">;

export function isWithinAvailability(
  blocks: AvailabilityWindow[],
  start: LocalSlot,
  end: LocalSlot,
): boolean {
  let endMinute = end.minute;
  if (end.date !== start.date) {
    const isMidnightRollover = end.minute === 0;
    if (!isMidnightRollover) {
      return false;
    }
    endMinute = MINUTES_PER_DAY;
  }

  return blocks.some(
    (block) =>
      block.weekday === start.weekday &&
      start.minute >= block.startMinute &&
      endMinute <= block.endMinute,
  );
}
