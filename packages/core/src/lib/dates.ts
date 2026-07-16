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

/**
 * Adds `days` (may be negative) to a "YYYY-MM-DD" date string, returning a
 * new "YYYY-MM-DD" string. Pure calendar-day arithmetic anchored at UTC
 * midnight — this is not a timezone conversion (the string has no time-of-day
 * component), so it's safe to use on already-localized date strings such as
 * `localDateString`'s output (used by the dashboard's day-range bucketing).
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const ms = Date.parse(`${dateStr}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
