import { describe, expect, it } from "vitest";

import { levelFromXp, levelProgress, xpForLevel } from "./level";

describe("xpForLevel", () => {
  it("matches the documented curve", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(400);
    expect(xpForLevel(4)).toBe(900);
    expect(xpForLevel(5)).toBe(1600);
  });
});

describe("levelFromXp", () => {
  it("is level 1 at 0 XP", () => {
    expect(levelFromXp(0)).toBe(1);
  });

  it("treats negative XP as 0", () => {
    expect(levelFromXp(-50)).toBe(1);
  });

  it("stays at the current level just below the next threshold", () => {
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(399)).toBe(2);
  });

  it("advances exactly at a level threshold", () => {
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(400)).toBe(3);
    expect(levelFromXp(900)).toBe(4);
    expect(levelFromXp(1600)).toBe(5);
  });
});

describe("levelProgress", () => {
  it("reports 0 progress at the very start", () => {
    const p = levelProgress(0);
    expect(p).toMatchObject({
      level: 1,
      totalXp: 0,
      levelFloorXp: 0,
      nextLevelXp: 100,
      progress: 0,
    });
  });

  it("reports fractional progress within a level", () => {
    const p = levelProgress(350);
    expect(p.level).toBe(2);
    expect(p.levelFloorXp).toBe(100);
    expect(p.nextLevelXp).toBe(400);
    expect(p.progress).toBeCloseTo(250 / 300);
  });

  it("resets progress to 0 right at a new level's floor", () => {
    const p = levelProgress(400);
    expect(p.level).toBe(3);
    expect(p.progress).toBe(0);
  });
});
