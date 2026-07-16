import { describe, expect, it } from "vitest";

import { zeroFillWellness } from "./getWellnessTrend";

describe("zeroFillWellness", () => {
  const range = ["2026-07-13", "2026-07-14", "2026-07-15"];

  it("fills missing days with all-null values", () => {
    const result = zeroFillWellness(
      [{ date: "2026-07-14", avgMood: 4, avgEnergy: 3, avgSleepQuality: null }],
      range,
    );
    expect(result).toEqual([
      {
        date: "2026-07-13",
        avgMood: null,
        avgEnergy: null,
        avgSleepQuality: null,
      },
      { date: "2026-07-14", avgMood: 4, avgEnergy: 3, avgSleepQuality: null },
      {
        date: "2026-07-15",
        avgMood: null,
        avgEnergy: null,
        avgSleepQuality: null,
      },
    ]);
  });

  it("returns all nulls for an empty row set", () => {
    const result = zeroFillWellness([], range);
    expect(result.every((r) => r.avgMood === null)).toBe(true);
  });
});
