import { sql } from "drizzle-orm";

import type { StreakKind } from "@gamer-health/validators";
import { and, eq } from "@gamer-health/db";
import { Streak } from "@gamer-health/db/schema";

import type { TxDb } from "../ctx";

export interface StreakState {
  current: number;
  longest: number;
  lastActivityDate: string | null;
}

/** Whole days between two "YYYY-MM-DD" local-date strings (`b` - `a`). */
export function daysBetween(a: string, b: string): number {
  const toUtcMs = (s: string) => Date.parse(`${s}T00:00:00Z`);
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

/**
 * Pure streak transition (docs/features/gamification.md): the same local day
 * is a no-op, the immediately following day increments `current`, and any
 * gap — or the first-ever activity (`lastActivityDate: null`) — resets
 * `current` to 1. `longest` never decreases.
 */
export function nextStreakState(prev: StreakState, today: string): StreakState {
  if (prev.lastActivityDate === today) {
    return prev;
  }
  const consecutive =
    prev.lastActivityDate !== null &&
    daysBetween(prev.lastActivityDate, today) === 1;
  const current = consecutive ? prev.current + 1 : 1;
  return {
    current,
    longest: Math.max(prev.longest, current),
    lastActivityDate: today,
  };
}

/**
 * Upserts a `streak` counter. Must be called from inside the
 * `recordRewardEvent` transaction — `streak` rows have a single writer.
 * Returns the resulting state (used by achievement evaluation in the same
 * call).
 */
export async function bumpStreak(
  tx: TxDb,
  userId: string,
  kind: StreakKind,
  today: string,
): Promise<StreakState> {
  const existing = await tx.query.Streak.findFirst({
    where: and(eq(Streak.userId, userId), eq(Streak.kind, kind)),
  });
  const prev: StreakState = existing
    ? {
        current: existing.current,
        longest: existing.longest,
        lastActivityDate: existing.lastActivityDate,
      }
    : { current: 0, longest: 0, lastActivityDate: null };

  const next = nextStreakState(prev, today);
  if (existing && next.lastActivityDate === existing.lastActivityDate) {
    return next; // same local day already recorded — no write needed
  }

  // Single-statement upsert: a try/catch fallback is NOT usable here — a
  // unique violation inside the surrounding transaction aborts it, so any
  // follow-up statement would fail with 25P02. greatest() keeps `longest`
  // monotonic even if a concurrent writer got there first.
  await tx
    .insert(Streak)
    .values({ userId, kind, ...next })
    .onConflictDoUpdate({
      target: [Streak.userId, Streak.kind],
      set: {
        current: next.current,
        lastActivityDate: next.lastActivityDate,
        longest: sql`greatest(${Streak.longest}, ${next.longest})`,
      },
    });
  return next;
}
