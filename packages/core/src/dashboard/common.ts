import { z } from "zod/v4";

import { addDaysToDateString } from "../lib/dates";

/** Shared `{ days }` input schema factory for the dashboard's range queries. */
export const daysInput = (def: number) =>
  z.object({ days: z.number().int().min(1).max(90).default(def) });

export interface LocalDateRange {
  /** Oldest local date ("YYYY-MM-DD") in the range, inclusive. */
  startDate: string;
  /** Newest local date ("YYYY-MM-DD") in the range, inclusive (= "today"). */
  endDate: string;
  /** Every local date in the range, oldest first. */
  dates: string[];
}

/**
 * Builds the `days`-long local-date window ending at (and including)
 * `endDateStr`. Pure — no DB, no timezone lookups (the caller already
 * resolved `endDateStr` via `localDateString`).
 */
export function buildLocalDateRange(
  endDateStr: string,
  days: number,
): LocalDateRange {
  const dates = Array.from({ length: days }, (_, i) =>
    addDaysToDateString(endDateStr, i - (days - 1)),
  );
  return {
    startDate: addDaysToDateString(endDateStr, -(days - 1)),
    endDate: endDateStr,
    dates,
  };
}
