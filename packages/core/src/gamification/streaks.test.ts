import { describe, expect, it } from "vitest";

import type { StreakState } from "./streaks";
import { daysBetween, nextStreakState } from "./streaks";

describe("daysBetween", () => {
  it("is 0 for the same date", () => {
    expect(daysBetween("2026-07-15", "2026-07-15")).toBe(0);
  });

  it("is 1 for consecutive dates", () => {
    expect(daysBetween("2026-07-14", "2026-07-15")).toBe(1);
  });

  it("is >1 across a gap", () => {
    expect(daysBetween("2026-07-10", "2026-07-15")).toBe(5);
  });

  it("handles month boundaries", () => {
    expect(daysBetween("2026-06-30", "2026-07-01")).toBe(1);
  });
});

describe("nextStreakState", () => {
  const first: StreakState = {
    current: 0,
    longest: 0,
    lastActivityDate: null,
  };

  it("first-ever activity starts current and longest at 1", () => {
    const next = nextStreakState(first, "2026-07-15");
    expect(next).toEqual({
      current: 1,
      longest: 1,
      lastActivityDate: "2026-07-15",
    });
  });

  it("same local day is a no-op (returns the same values)", () => {
    const prev: StreakState = {
      current: 3,
      longest: 5,
      lastActivityDate: "2026-07-15",
    };
    const next = nextStreakState(prev, "2026-07-15");
    expect(next).toEqual(prev);
  });

  it("consecutive day increments current and raises longest when exceeded", () => {
    const prev: StreakState = {
      current: 5,
      longest: 5,
      lastActivityDate: "2026-07-14",
    };
    const next = nextStreakState(prev, "2026-07-15");
    expect(next).toEqual({
      current: 6,
      longest: 6,
      lastActivityDate: "2026-07-15",
    });
  });

  it("consecutive day does not lower longest when current is still below it", () => {
    const prev: StreakState = {
      current: 2,
      longest: 10,
      lastActivityDate: "2026-07-14",
    };
    const next = nextStreakState(prev, "2026-07-15");
    expect(next).toEqual({
      current: 3,
      longest: 10,
      lastActivityDate: "2026-07-15",
    });
  });

  it("a gap of >=2 days resets current to 1 but keeps longest", () => {
    const prev: StreakState = {
      current: 7,
      longest: 7,
      lastActivityDate: "2026-07-10",
    };
    const next = nextStreakState(prev, "2026-07-15");
    expect(next).toEqual({
      current: 1,
      longest: 7,
      lastActivityDate: "2026-07-15",
    });
  });
});
