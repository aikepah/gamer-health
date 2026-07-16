import { z } from "zod/v4";

import { and, eq, inArray, isNull } from "@gamer-health/db";
import { GameSession, Habit, HabitPrompt } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { addMinutes, localDateString, zonedTimeToUtc } from "../lib/dates";
import { requireUserId } from "../lib/auth";
import { getOrCreateProfile } from "../profile/getOrCreateProfile";
import { HABIT_DEFINITIONS } from "./definitions";
import type { HabitRow } from "./upsertHabit";
import type { HabitPromptRow } from "./respondToPrompt";

export const syncHabitPromptsInput = z.object({
  /** Injectable for tests only; defaults to the real current time. */
  now: z.date().optional(),
});
export type SyncHabitPromptsInput = z.infer<typeof syncHabitPromptsInput>;

export interface PendingHabitPrompt extends HabitPromptRow {
  habit: HabitRow;
  promptText: string;
  title: string;
}

/** Sanity bound on how many session-interval occurrences we'll ever compute. */
const MAX_INTERVAL_OCCURRENCES = 500;
/** General backstop: any pending prompt this old is stale regardless of kind. */
const EXPIRY_GRACE_MINUTES = 60;

type HabitPromptInsert = typeof HabitPrompt.$inferInsert;

/**
 * Generation-on-read engine (docs/features/habit-engine.md). Materializes due
 * habit prompts for the caller, expires stale ones, and returns what's
 * currently pending. Deterministic due times + the unique (habitId, dueAt)
 * index make repeated/concurrent calls idempotent — safe to call from a
 * polled query.
 */
export async function syncHabitPrompts(
  ctx: ServiceCtx,
  input: SyncHabitPromptsInput,
): Promise<{ pending: PendingHabitPrompt[] }> {
  const userId = requireUserId(ctx);
  const now = input.now ?? new Date();
  const profile = await getOrCreateProfile(ctx);
  const tz = profile.timezone ?? "UTC";
  const today = localDateString(now, tz);

  const habits = await ctx.db.query.Habit.findMany({
    where: and(eq(Habit.userId, userId), eq(Habit.enabled, true)),
  });

  const activeSession = await ctx.db.query.GameSession.findFirst({
    where: and(eq(GameSession.userId, userId), isNull(GameSession.endedAt)),
  });

  const candidates: HabitPromptInsert[] = [];

  for (const habit of habits) {
    const def = HABIT_DEFINITIONS[habit.kind];

    if (habit.triggerType === "session_interval") {
      if (!activeSession) continue;
      const intervalMinutes =
        habit.config.intervalMinutes ?? def.defaultConfig.intervalMinutes;
      if (!intervalMinutes) continue;

      for (let k = 1; k <= MAX_INTERVAL_OCCURRENCES; k++) {
        const dueAt = addMinutes(activeSession.startedAt, k * intervalMinutes);
        if (dueAt.getTime() > now.getTime()) break;
        candidates.push({
          habitId: habit.id,
          userId,
          sessionId: activeSession.id,
          dueAt,
        });
      }
      continue;
    }

    // triggerType === "daily_schedule" — today only, never backfilled.
    if (habit.kind === "daily_movement") {
      const timeOfDay = habit.config.timeOfDay ?? def.defaultConfig.timeOfDay;
      if (!timeOfDay) continue;
      const dueAt = zonedTimeToUtc(today, timeOfDay, tz);
      if (dueAt.getTime() <= now.getTime()) {
        candidates.push({ habitId: habit.id, userId, sessionId: null, dueAt });
      }
      continue;
    }

    if (habit.kind === "bedtime_cutoff") {
      if (!activeSession) continue;
      const bedtime = habit.config.bedtime ?? def.defaultConfig.bedtime;
      const leadMinutes =
        habit.config.leadMinutes ?? def.defaultConfig.leadMinutes;
      if (!bedtime || leadMinutes == null) continue;
      const dueAt = addMinutes(zonedTimeToUtc(today, bedtime, tz), -leadMinutes);
      if (dueAt.getTime() <= now.getTime()) {
        candidates.push({ habitId: habit.id, userId, sessionId: null, dueAt });
      }
    }
  }

  if (candidates.length > 0) {
    await ctx.db.insert(HabitPrompt).values(candidates).onConflictDoNothing();
  }

  // Load all pending prompts (joined) once — used both to compute expiry and
  // to build the final list, avoiding a third round trip.
  const pendingRows = await ctx.db.query.HabitPrompt.findMany({
    where: and(eq(HabitPrompt.userId, userId), eq(HabitPrompt.status, "pending")),
    with: { habit: true, session: true },
  });

  const expiredIds: string[] = [];
  for (const row of pendingRows) {
    const { habit } = row;
    const def = HABIT_DEFINITIONS[habit.kind];

    const sessionEnded =
      habit.triggerType === "session_interval" &&
      row.session?.endedAt != null;

    const pastBedtime =
      habit.kind === "bedtime_cutoff" &&
      now.getTime() >
        addMinutes(
          row.dueAt,
          habit.config.leadMinutes ?? def.defaultConfig.leadMinutes ?? 0,
        ).getTime();

    const pastLocalDay =
      habit.kind === "daily_movement" && localDateString(row.dueAt, tz) < today;

    const stale =
      now.getTime() > addMinutes(row.dueAt, EXPIRY_GRACE_MINUTES).getTime();

    if (sessionEnded || pastBedtime || pastLocalDay || stale) {
      expiredIds.push(row.id);
    }
  }

  if (expiredIds.length > 0) {
    await ctx.db
      .update(HabitPrompt)
      .set({ status: "expired" })
      .where(inArray(HabitPrompt.id, expiredIds));
  }

  const expiredIdSet = new Set(expiredIds);
  const pending: PendingHabitPrompt[] = pendingRows
    .filter(
      (row) => !expiredIdSet.has(row.id) && row.dueAt.getTime() <= now.getTime(),
    )
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
    .map((row) => ({
      ...row,
      promptText: HABIT_DEFINITIONS[row.habit.kind].promptText,
      title: HABIT_DEFINITIONS[row.habit.kind].title,
    }));

  return { pending };
}
