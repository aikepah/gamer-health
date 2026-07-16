import { describe, expect, it } from "vitest";

import { CoreError } from "../lib/errors";
import { assertValidSessionTimes } from "./time";

describe("assertValidSessionTimes", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  it("passes for a start strictly before end, ending in the past", () => {
    expect(() =>
      assertValidSessionTimes(
        new Date("2026-07-15T09:00:00Z"),
        new Date("2026-07-15T10:00:00Z"),
        now,
      ),
    ).not.toThrow();
  });

  it("passes when end equals now", () => {
    expect(() =>
      assertValidSessionTimes(new Date("2026-07-15T09:00:00Z"), now, now),
    ).not.toThrow();
  });

  it("throws BAD_REQUEST when end equals start", () => {
    const t = new Date("2026-07-15T09:00:00Z");
    expect(() => assertValidSessionTimes(t, t, now)).toThrowError(CoreError);
    try {
      assertValidSessionTimes(t, t, now);
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CoreError);
      expect((err as CoreError).code).toBe("BAD_REQUEST");
    }
  });

  it("throws BAD_REQUEST when end is before start", () => {
    expect(() =>
      assertValidSessionTimes(
        new Date("2026-07-15T10:00:00Z"),
        new Date("2026-07-15T09:00:00Z"),
        now,
      ),
    ).toThrowError(CoreError);
  });

  it("throws BAD_REQUEST when end is in the future", () => {
    expect(() =>
      assertValidSessionTimes(
        new Date("2026-07-15T09:00:00Z"),
        new Date("2026-07-15T13:00:00Z"),
        now,
      ),
    ).toThrowError(CoreError);
  });
});
