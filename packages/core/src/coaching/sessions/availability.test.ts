import { describe, expect, it } from "vitest";

import { isWithinAvailability, toLocalSlot } from "./availability";

describe("toLocalSlot", () => {
  it("decomposes an instant into weekday/minute/date in the given timezone", () => {
    // 2026-07-22 is a Wednesday. 17:30 CDT (UTC-5) = 22:30 UTC.
    const instant = new Date("2026-07-22T22:30:00.000Z");
    const slot = toLocalSlot(instant, "America/Chicago");
    expect(slot.weekday).toBe(3); // Wednesday
    expect(slot.minute).toBe(17 * 60 + 30);
    expect(slot.date).toBe("2026-07-22");
  });

  it("crosses a calendar day when the UTC offset pushes it over midnight", () => {
    // 23:00 UTC on a Wednesday is 18:00 CDT the same day, but 01:00 UTC the
    // NEXT day would be 20:00 CDT the previous day — check the reverse: late
    // UTC evening is still the same Chicago afternoon.
    const instant = new Date("2026-07-23T04:30:00.000Z"); // Thu 04:30 UTC
    const slot = toLocalSlot(instant, "America/Chicago");
    // Chicago is UTC-5 in July (CDT): 04:30 UTC Thu = 23:30 Wed.
    expect(slot.weekday).toBe(3);
    expect(slot.date).toBe("2026-07-22");
    expect(slot.minute).toBe(23 * 60 + 30);
  });
});

describe("isWithinAvailability", () => {
  const wedEvening = { weekday: 3, startMinute: 1020, endMinute: 1200 }; // 17:00-20:00

  it("accepts a slot fully contained in one block", () => {
    const start = { weekday: 3, minute: 1020, date: "2026-07-22" };
    const end = { weekday: 3, minute: 1080, date: "2026-07-22" };
    expect(isWithinAvailability([wedEvening], start, end)).toBe(true);
  });

  it("rejects a slot starting before the block opens", () => {
    const start = { weekday: 3, minute: 1000, date: "2026-07-22" };
    const end = { weekday: 3, minute: 1080, date: "2026-07-22" };
    expect(isWithinAvailability([wedEvening], start, end)).toBe(false);
  });

  it("rejects a slot ending after the block closes", () => {
    const start = { weekday: 3, minute: 1140, date: "2026-07-22" };
    const end = { weekday: 3, minute: 1260, date: "2026-07-22" };
    expect(isWithinAvailability([wedEvening], start, end)).toBe(false);
  });

  it("rejects a slot on the wrong weekday even at the same minutes", () => {
    const start = { weekday: 4, minute: 1020, date: "2026-07-23" };
    const end = { weekday: 4, minute: 1080, date: "2026-07-23" };
    expect(isWithinAvailability([wedEvening], start, end)).toBe(false);
  });

  it("rejects a slot spanning two adjacent blocks (not one continuous block)", () => {
    const blocks = [
      { weekday: 3, startMinute: 1020, endMinute: 1100 },
      { weekday: 3, startMinute: 1100, endMinute: 1200 },
    ];
    const start = { weekday: 3, minute: 1080, date: "2026-07-22" };
    const end = { weekday: 3, minute: 1140, date: "2026-07-22" }; // crosses the 1100 seam
    expect(isWithinAvailability(blocks, start, end)).toBe(false);
  });

  it("rejects a slot spanning two different calendar dates in general", () => {
    const start = { weekday: 3, minute: 1380, date: "2026-07-22" }; // 23:00
    const end = { weekday: 4, minute: 60, date: "2026-07-23" }; // 01:00 next day
    expect(isWithinAvailability([wedEvening], start, end)).toBe(false);
  });

  it("treats an end exactly at local midnight as minute 1440 on the start's date", () => {
    const blocks = [{ weekday: 3, startMinute: 1320, endMinute: 1440 }]; // 22:00-24:00
    const start = { weekday: 3, minute: 1320, date: "2026-07-22" };
    const end = { weekday: 4, minute: 0, date: "2026-07-23" }; // exactly midnight
    expect(isWithinAvailability(blocks, start, end)).toBe(true);
  });

  it("returns false when there are no blocks for that weekday", () => {
    const start = { weekday: 2, minute: 1020, date: "2026-07-21" };
    const end = { weekday: 2, minute: 1080, date: "2026-07-21" };
    expect(isWithinAvailability([wedEvening], start, end)).toBe(false);
  });
});
