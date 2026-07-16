import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  Checkin,
  GameSession,
  HabitPrompt,
  RewardEvent,
  Streak,
  UserAchievement,
} from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { recordRewardEvent } from "./events";

interface StreakRow {
  userId: string;
  kind: string;
  current: number;
  longest: number;
  lastActivityDate: string | null;
}

interface FakeDbConfig {
  /** Whether the RewardEvent insert actually inserts a row (vs. a duplicate no-op). */
  eventInserted?: boolean;
  streaks?: Record<string, StreakRow | undefined>;
  sessionCount?: number;
  checkinCount?: number;
  habitPromptDoneCount?: number;
  /** Achievement keys that are newly unlocked by this call (insert returns a row). */
  newlyUnlocked?: Set<string>;
}

function makeCtx(config: FakeDbConfig) {
  const streaks = config.streaks ?? {};
  const streakUpdateSet = vi.fn();
  const streakInsertValues = vi.fn();
  const achievementInsertValues = vi.fn();
  const rewardEventInsertValues = vi.fn();

  function fakeTx() {
    return {
      query: {
        Streak: {
          findFirst: vi.fn(({ where }: { where: unknown }) => {
            // Extract the kind by re-running against each configured entry —
            // simpler: we key streaks by kind and rely on call order matching
            // the order recordRewardEvent bumps them, tracked via a queue.
            void where;
            const kind = kindQueue.shift();
            return Promise.resolve(kind ? streaks[kind] : undefined);
          }),
        },
      },
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((vals: Record<string, unknown>) => {
          if (table === RewardEvent) {
            rewardEventInsertValues(vals);
            const isAchievementEvent =
              vals.eventType === "achievement_unlocked";
            return {
              onConflictDoNothing: () => ({
                returning: () =>
                  Promise.resolve(
                    isAchievementEvent
                      ? [{ id: "achievement-event" }]
                      : config.eventInserted === false
                        ? []
                        : [{ id: "event-1" }],
                  ),
              }),
            };
          }
          if (table === Streak) {
            streakInsertValues(vals);
            return {
              onConflictDoUpdate: vi.fn((opts: { set: unknown }) => {
                streakUpdateSet(opts.set);
                return Promise.resolve(undefined);
              }),
            };
          }
          if (table === UserAchievement) {
            achievementInsertValues(vals);
            const key = vals.achievementKey as string;
            return {
              onConflictDoNothing: () => ({
                returning: () =>
                  Promise.resolve(
                    config.newlyUnlocked?.has(key)
                      ? [{ userId: "user_1" }]
                      : [],
                  ),
              }),
            };
          }
          throw new Error("unexpected insert table in test");
        }),
      })),
      update: vi.fn(() => ({
        set: streakUpdateSet.mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      })),
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn(() => {
            if (table === GameSession) {
              return Promise.resolve([{ n: config.sessionCount ?? 0 }]);
            }
            if (table === Checkin) {
              return Promise.resolve([{ n: config.checkinCount ?? 0 }]);
            }
            if (table === HabitPrompt) {
              return Promise.resolve([{ n: config.habitPromptDoneCount ?? 0 }]);
            }
            throw new Error("unexpected select table in test");
          }),
        })),
      })),
    };
  }

  // Tracks which streak kind is being looked up next, in call order — set by
  // the test right before invoking recordRewardEvent.
  const kindQueue: string[] = [];

  const tx = fakeTx();
  const db = {
    query: {
      Profile: {
        findFirst: vi.fn().mockResolvedValue({
          userId: "user_1",
          timezone: "UTC",
          platforms: [],
          goals: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    },
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: "user_1" } as ServiceCtx,
    tx,
    kindQueue,
    streakUpdateSet,
    streakInsertValues,
    achievementInsertValues,
    rewardEventInsertValues,
  };
}

describe("recordRewardEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx({});
    await expect(
      recordRewardEvent(
        { ...ctx, userId: null },
        {
          eventType: "checkin_completed",
          sourceId: "checkin_1",
        },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("is a no-op when the event is a duplicate (unique violation short-circuit)", async () => {
    const { ctx, streakInsertValues, achievementInsertValues } = makeCtx({
      eventInserted: false,
    });
    const result = await recordRewardEvent(ctx, {
      eventType: "checkin_completed",
      sourceId: "checkin_1",
    });
    expect(result).toEqual({ recorded: false });
    expect(streakInsertValues).not.toHaveBeenCalled();
    expect(achievementInsertValues).not.toHaveBeenCalled();
  });

  it("bumps daily_checkin and unlocks first_checkin on a brand-new checkin event", async () => {
    const { ctx, kindQueue, streakInsertValues, rewardEventInsertValues } =
      makeCtx({
        checkinCount: 1,
        newlyUnlocked: new Set(["first_checkin"]),
      });
    kindQueue.push("daily_checkin");

    const result = await recordRewardEvent(ctx, {
      eventType: "checkin_completed",
      sourceId: "checkin_1",
    });

    expect(result).toEqual({ recorded: true });
    expect(streakInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        kind: "daily_checkin",
        current: 1,
        longest: 1,
      }),
    );
    // Once for the source event, once for the achievement_unlocked event.
    expect(rewardEventInsertValues).toHaveBeenCalledTimes(2);
    expect(rewardEventInsertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventType: "achievement_unlocked",
        sourceId: "first_checkin",
        xp: 25,
      }),
    );
  });

  it("bumps both daily_habit and habit_hydrate for a hydrate prompt completion", async () => {
    const { ctx, kindQueue, streakInsertValues } = makeCtx({
      habitPromptDoneCount: 1,
    });
    kindQueue.push("daily_habit", "habit_hydrate");

    await recordRewardEvent(ctx, {
      eventType: "habit_prompt_completed",
      sourceId: "prompt_1",
      meta: { habitKind: "hydrate" },
    });

    expect(streakInsertValues).toHaveBeenCalledTimes(2);
    const kinds = streakInsertValues.mock.calls.map(
      (call) => (call[0] as { kind: string }).kind,
    );
    expect(kinds).toEqual(["daily_habit", "habit_hydrate"]);
  });

  it("does not unlock an achievement a second time (onConflictDoNothing returns nothing)", async () => {
    const { ctx, kindQueue, rewardEventInsertValues } = makeCtx({
      checkinCount: 1,
      newlyUnlocked: new Set(), // insert conflicts — already unlocked
    });
    kindQueue.push("daily_checkin");

    await recordRewardEvent(ctx, {
      eventType: "checkin_completed",
      sourceId: "checkin_2",
    });

    // Only the source event was inserted, no achievement_unlocked event.
    expect(rewardEventInsertValues).toHaveBeenCalledTimes(1);
  });
});
