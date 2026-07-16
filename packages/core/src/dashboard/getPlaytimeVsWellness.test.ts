import { describe, expect, it } from "vitest";

import { mergePlaytimeAndMood } from "./getPlaytimeVsWellness";

describe("mergePlaytimeAndMood", () => {
  it("unions days present in either source, sorted ascending", () => {
    const result = mergePlaytimeAndMood(
      [
        { date: "2026-07-14", minutes: 90 },
        { date: "2026-07-10", minutes: 30 },
      ],
      [
        { date: "2026-07-12", avgMood: 4 },
        { date: "2026-07-14", avgMood: 2 },
      ],
    );
    expect(result).toEqual([
      { date: "2026-07-10", minutes: 30, avgMood: null },
      { date: "2026-07-12", minutes: 0, avgMood: 4 },
      { date: "2026-07-14", minutes: 90, avgMood: 2 },
    ]);
  });

  it("returns an empty array when both sources are empty", () => {
    expect(mergePlaytimeAndMood([], [])).toEqual([]);
  });

  it("does not invent days absent from both sources", () => {
    const result = mergePlaytimeAndMood(
      [{ date: "2026-07-14", minutes: 90 }],
      [{ date: "2026-07-14", avgMood: 3 }],
    );
    expect(result).toEqual([{ date: "2026-07-14", minutes: 90, avgMood: 3 }]);
  });
});
