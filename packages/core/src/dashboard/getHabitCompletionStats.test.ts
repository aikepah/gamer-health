import { describe, expect, it } from "vitest";

import { aggregateHabitCompletion } from "./getHabitCompletionStats";

describe("aggregateHabitCompletion", () => {
  it("returns null completionRate and empty byHabit for no rows", () => {
    const result = aggregateHabitCompletion([]);
    expect(result).toEqual({
      done: 0,
      skipped: 0,
      expired: 0,
      completionRate: null,
      byHabit: [],
    });
  });

  it("aggregates totals and per-habit done/total across definitions", () => {
    const result = aggregateHabitCompletion([
      { definitionId: "def_break", title: "Break Reminder", status: "done", count: 1 },
      { definitionId: "def_break", title: "Break Reminder", status: "skipped", count: 1 },
      { definitionId: "def_break", title: "Break Reminder", status: "expired", count: 1 },
      { definitionId: "def_hydrate", title: "Hydration Reminder", status: "done", count: 3 },
      { definitionId: "def_hydrate", title: "Hydration Reminder", status: "skipped", count: 1 },
      { definitionId: "def_hydrate", title: "Hydration Reminder", status: "expired", count: 2 },
      { definitionId: "def_movement", title: "Daily Movement", status: "done", count: 1 },
      { definitionId: "def_movement", title: "Daily Movement", status: "expired", count: 1 },
    ]);

    expect(result.done).toBe(5);
    expect(result.skipped).toBe(2);
    expect(result.expired).toBe(4);
    expect(result.completionRate).toBeCloseTo(5 / 11);

    const byHabit = new Map(result.byHabit.map((k) => [k.definitionId, k]));
    expect(byHabit.get("def_break")).toEqual({
      definitionId: "def_break",
      title: "Break Reminder",
      done: 1,
      total: 3,
    });
    expect(byHabit.get("def_hydrate")).toEqual({
      definitionId: "def_hydrate",
      title: "Hydration Reminder",
      done: 3,
      total: 6,
    });
    expect(byHabit.get("def_movement")).toEqual({
      definitionId: "def_movement",
      title: "Daily Movement",
      done: 1,
      total: 2,
    });
    // A definition with no prompts in range must not appear.
    expect(byHabit.has("def_bedtime")).toBe(false);
  });

  it("computes completionRate 0 when nothing is done", () => {
    const result = aggregateHabitCompletion([
      { definitionId: "def_hydrate", title: "Hydration Reminder", status: "skipped", count: 2 },
      { definitionId: "def_hydrate", title: "Hydration Reminder", status: "expired", count: 1 },
    ]);
    expect(result.completionRate).toBe(0);
  });
});
