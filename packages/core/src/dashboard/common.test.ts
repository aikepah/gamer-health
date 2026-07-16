import { describe, expect, it } from "vitest";

import { buildLocalDateRange } from "./common";

describe("buildLocalDateRange", () => {
  it("returns `days` consecutive dates, oldest first, ending at endDateStr", () => {
    const range = buildLocalDateRange("2026-07-15", 7);
    expect(range.dates).toEqual([
      "2026-07-09",
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
    ]);
    expect(range.startDate).toBe("2026-07-09");
    expect(range.endDate).toBe("2026-07-15");
  });

  it("handles days=1 as just the end date", () => {
    const range = buildLocalDateRange("2026-07-15", 1);
    expect(range.dates).toEqual(["2026-07-15"]);
    expect(range.startDate).toBe("2026-07-15");
  });

  it("crosses a month boundary correctly", () => {
    const range = buildLocalDateRange("2026-03-02", 5);
    expect(range.dates).toEqual([
      "2026-02-26",
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });
});
