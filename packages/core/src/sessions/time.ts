import { CoreError } from "../lib/errors";

/**
 * Validates the start/end pair for a retroactively-logged or edited session:
 * the end must be strictly after the start, and cannot be in the future.
 * Throws `CoreError("BAD_REQUEST")` when either condition is violated.
 */
export function assertValidSessionTimes(
  startedAt: Date,
  endedAt: Date,
  now: Date = new Date(),
): void {
  if (!(startedAt.getTime() < endedAt.getTime())) {
    throw new CoreError(
      "BAD_REQUEST",
      "Session end must be after the start time",
    );
  }
  if (endedAt.getTime() > now.getTime()) {
    throw new CoreError("BAD_REQUEST", "Session end cannot be in the future");
  }
}
