import { describe, expect, it } from "vitest";

import { aggregateHabitCompletion } from "./getHabitCompletionStats";

describe("aggregateHabitCompletion", () => {
  it("returns null completionRate and empty byKind for no rows", () => {
    const result = aggregateHabitCompletion([]);
    expect(result).toEqual({
      done: 0,
      skipped: 0,
      expired: 0,
      completionRate: null,
      byKind: [],
    });
  });

  it("aggregates totals and per-kind done/total across kinds", () => {
    const result = aggregateHabitCompletion([
      { kind: "break_interval", status: "done", count: 1 },
      { kind: "break_interval", status: "skipped", count: 1 },
      { kind: "break_interval", status: "expired", count: 1 },
      { kind: "hydrate", status: "done", count: 3 },
      { kind: "hydrate", status: "skipped", count: 1 },
      { kind: "hydrate", status: "expired", count: 2 },
      { kind: "daily_movement", status: "done", count: 1 },
      { kind: "daily_movement", status: "expired", count: 1 },
    ]);

    expect(result.done).toBe(5);
    expect(result.skipped).toBe(2);
    expect(result.expired).toBe(4);
    expect(result.completionRate).toBeCloseTo(5 / 11);

    const byKind = new Map(result.byKind.map((k) => [k.kind, k]));
    expect(byKind.get("break_interval")).toEqual({
      kind: "break_interval",
      done: 1,
      total: 3,
    });
    expect(byKind.get("hydrate")).toEqual({
      kind: "hydrate",
      done: 3,
      total: 6,
    });
    expect(byKind.get("daily_movement")).toEqual({
      kind: "daily_movement",
      done: 1,
      total: 2,
    });
    // A kind with no prompts in range must not appear.
    expect(byKind.has("bedtime_cutoff")).toBe(false);
  });

  it("computes completionRate 0 when nothing is done", () => {
    const result = aggregateHabitCompletion([
      { kind: "hydrate", status: "skipped", count: 2 },
      { kind: "hydrate", status: "expired", count: 1 },
    ]);
    expect(result.completionRate).toBe(0);
  });
});
