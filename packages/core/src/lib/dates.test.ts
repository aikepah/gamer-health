import { describe, expect, it } from "vitest";

import { addMinutes, localDateString, zonedTimeToUtc } from "./dates";

describe("localDateString", () => {
  it("returns the instant's own date in UTC", () => {
    expect(localDateString(new Date("2026-07-15T23:30:00Z"), "UTC")).toBe(
      "2026-07-15",
    );
  });

  it("rolls back to the previous local day west of UTC", () => {
    // 2026-07-15T04:30:00Z is 2026-07-14T21:30 in America/Los_Angeles (UTC-7 in summer).
    expect(
      localDateString(new Date("2026-07-15T04:30:00Z"), "America/Los_Angeles"),
    ).toBe("2026-07-14");
  });

  it("rolls forward to the next local day east of UTC", () => {
    // 2026-07-15T23:30:00Z is 2026-07-16T08:30 in Asia/Tokyo (UTC+9).
    expect(localDateString(new Date("2026-07-15T23:30:00Z"), "Asia/Tokyo")).toBe(
      "2026-07-16",
    );
  });

  it("is stable across the US spring-forward DST boundary", () => {
    // Both instants are local midday in America/New_York, one day apart,
    // straddling the 2026-03-08 spring-forward.
    expect(
      localDateString(new Date("2026-03-07T17:00:00Z"), "America/New_York"),
    ).toBe("2026-03-07");
    expect(
      localDateString(new Date("2026-03-08T16:00:00Z"), "America/New_York"),
    ).toBe("2026-03-08");
  });
});

describe("zonedTimeToUtc", () => {
  it("computes the UTC instant of a wall time in UTC", () => {
    expect(zonedTimeToUtc("2026-07-15", "09:30", "UTC")).toEqual(
      new Date("2026-07-15T09:30:00Z"),
    );
  });

  it("applies the standard-time offset before the US spring-forward", () => {
    // 2026-03-07 is EST (UTC-5): noon local == 17:00 UTC.
    expect(zonedTimeToUtc("2026-03-07", "12:00", "America/New_York")).toEqual(
      new Date("2026-03-07T17:00:00Z"),
    );
  });

  it("applies the daylight-time offset after the US spring-forward", () => {
    // 2026-03-08 is EDT (UTC-4): noon local == 16:00 UTC.
    expect(zonedTimeToUtc("2026-03-08", "12:00", "America/New_York")).toEqual(
      new Date("2026-03-08T16:00:00Z"),
    );
  });

  it("applies the standard-time offset after the US fall-back", () => {
    // 2026-11-01 falls back to EST (UTC-5) at 2am local: noon local == 17:00 UTC.
    expect(zonedTimeToUtc("2026-11-01", "12:00", "America/New_York")).toEqual(
      new Date("2026-11-01T17:00:00Z"),
    );
  });
});

describe("addMinutes", () => {
  it("adds positive minutes", () => {
    expect(addMinutes(new Date("2026-07-15T10:00:00Z"), 90)).toEqual(
      new Date("2026-07-15T11:30:00Z"),
    );
  });

  it("subtracts for negative minutes", () => {
    expect(addMinutes(new Date("2026-07-15T10:00:00Z"), -30)).toEqual(
      new Date("2026-07-15T09:30:00Z"),
    );
  });
});
