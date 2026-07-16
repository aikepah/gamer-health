/**
 * Level curve (docs/features/gamification.md). Levels are always derived
 * from `reward_event`'s XP sum — never stored. Level 1 at 0 XP, level 2 at
 * 100, level 3 at 400, level 4 at 900, level 5 at 1600…
 */

/** XP required to *reach* `level` (the floor of that level's XP range). */
export function xpForLevel(level: number): number {
  return 100 * (level - 1) ** 2;
}

/** The level `totalXp` currently falls in. Negative XP is treated as 0. */
export function levelFromXp(totalXp: number): number {
  return Math.floor(Math.sqrt(Math.max(totalXp, 0) / 100)) + 1;
}

export interface LevelProgress {
  level: number;
  totalXp: number;
  /** `xpForLevel(level)` — XP at which the current level began. */
  levelFloorXp: number;
  /** `xpForLevel(level + 1)` — XP at which the next level begins. */
  nextLevelXp: number;
  /** 0..1 progress within the current level's XP range. */
  progress: number;
}

export function levelProgress(totalXp: number): LevelProgress {
  const level = levelFromXp(totalXp);
  const levelFloorXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const span = nextLevelXp - levelFloorXp;
  const progress = span > 0 ? (Math.max(totalXp, 0) - levelFloorXp) / span : 0;
  return { level, totalXp, levelFloorXp, nextLevelXp, progress };
}
