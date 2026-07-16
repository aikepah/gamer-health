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
