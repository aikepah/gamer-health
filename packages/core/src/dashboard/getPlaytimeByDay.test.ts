import { describe, expect, it } from "vitest";

import { zeroFillPlaytime } from "./getPlaytimeByDay";

describe("zeroFillPlaytime", () => {
  const range = ["2026-07-13", "2026-07-14", "2026-07-15"];

  it("zero-fills days with no rows", () => {
    const result = zeroFillPlaytime(
      [{ date: "2026-07-14", minutes: 90 }],
      range,
    );
    expect(result).toEqual([
      { date: "2026-07-13", minutes: 0 },
      { date: "2026-07-14", minutes: 90 },
      { date: "2026-07-15", minutes: 0 },
    ]);
  });

  it("returns all zeros when there are no rows", () => {
    expect(zeroFillPlaytime([], range)).toEqual([
      { date: "2026-07-13", minutes: 0 },
      { date: "2026-07-14", minutes: 0 },
      { date: "2026-07-15", minutes: 0 },
    ]);
  });

  it("preserves range order regardless of row order", () => {
    const result = zeroFillPlaytime(
      [
        { date: "2026-07-15", minutes: 30 },
        { date: "2026-07-13", minutes: 60 },
      ],
      range,
    );
    expect(result.map((r) => r.date)).toEqual(range);
    expect(result[0]?.minutes).toBe(60);
    expect(result[2]?.minutes).toBe(30);
  });

  it("ignores rows outside the range", () => {
    const result = zeroFillPlaytime(
      [{ date: "2026-06-01", minutes: 100 }],
      range,
    );
    expect(result.every((r) => r.minutes === 0)).toBe(true);
  });
});
