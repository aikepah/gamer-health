import { TZDate } from "@date-fns/tz";

/**
 * Timezone helpers shared by habit-engine, gamification, and the dashboard.
 * Uses `@date-fns/tz` for all offset math — never hand-roll it.
 */

/** Returns the "YYYY-MM-DD" wall-clock date for `instant` in `timeZone`. */
export function localDateString(instant: Date, timeZone: string): string {
  const zoned = new TZDate(instant, timeZone);
  const year = zoned.getFullYear();
  const month = String(zoned.getMonth() + 1).padStart(2, "0");
  const day = String(zoned.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns the UTC instant of wall-clock time `time` ("HH:MM") on `dateStr`
 * ("YYYY-MM-DD") in `timeZone`.
 */
export function zonedTimeToUtc(
  dateStr: string,
  time: string,
  timeZone: string,
): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const zoned = new TZDate(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1,
    hours ?? 0,
    minutes ?? 0,
    0,
    timeZone,
  );
  return new Date(zoned.getTime());
}

/** Returns a new Date offset by `minutes` (may be negative) from `d`. */
export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}
