/** Formats a duration in milliseconds as e.g. "1h 23m" (or just "23m" under an hour). */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

/** Formats a duration in milliseconds as a ticking "H:MM:SS" (or "MM:SS") clock. */
export function formatElapsedClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (hours === 0) {
    return `${minutes}:${pad(seconds)}`;
  }
  return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}

/** Formats a Date for a `datetime-local` input's `value` prop, in local time. */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Parses a `datetime-local` input value back into a Date in local time. */
export function fromDatetimeLocalValue(value: string): Date {
  return new Date(value);
}

/** Formats a minute count as hours for chart axis labels, e.g. "1.5h". */
export function formatMinutesAsHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)}h`;
}

/**
 * Parses an `<input type="time">` value ("HH:MM") into minutes-from-midnight.
 * Anything that isn't a valid HH:MM (including the empty value a cleared time
 * input produces) yields 0 — `?? 0` alone wouldn't do it, since a non-numeric
 * part parses to NaN rather than undefined.
 */
export function minutesFromTimeString(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) {
    return 0;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return 0;
  }
  return hours * 60 + minutes;
}

/**
 * Formats minutes-from-midnight as an `<input type="time">` value ("HH:MM").
 * Clamped to 0–1439: an input can't represent 24:00, so an end-of-day 1440
 * renders as 23:59.
 */
export function timeStringFromMinutes(minutes: number): string {
  const clamped = Math.min(1439, Math.max(0, minutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

/** Formats minutes-from-midnight (0-1440) as a 12-hour clock label, e.g. "5:00 PM". */
export function formatMinuteOfDay(minutes: number): string {
  const totalHours24 = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const period = totalHours24 < 12 ? "AM" : "PM";
  const hours12 = totalHours24 % 12 === 0 ? 12 : totalHours24 % 12;
  return `${hours12}:${mins.toString().padStart(2, "0")} ${period}`;
}

/** Formats a "YYYY-MM-DD" local-date string as a short chart label, e.g. "Jul 14". */
export function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1),
  ).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
