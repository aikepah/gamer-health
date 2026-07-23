import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import { queryHabitCompletionRaw } from "./queryHabitCompletionRaw";

function makeChain(result: unknown[]) {
  const chain: {
    from: () => typeof chain;
    innerJoin: () => typeof chain;
    where: () => typeof chain;
    groupBy: (..._args: unknown[]) => Promise<unknown[]>;
  } = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    groupBy: () => Promise.resolve(result),
  };
  return chain;
}

function makeCtx(config: {
  profile?: { timezone: string | null } | undefined;
  rows?: {
    habitId: string;
    definitionId: string;
    status: string;
    count: string;
  }[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(config.profile);
  const select = vi.fn(() => makeChain(config.rows ?? []));

  const db = {
    query: { Profile: { findFirst: profileFindFirst } },
    select,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "player_1" } as ServiceCtx, profileFindFirst };
}

describe("queryHabitCompletionRaw", () => {
  it("falls back to UTC when the target user has no profile/timezone", async () => {
    const { ctx } = makeCtx({ profile: undefined });
    await expect(
      queryHabitCompletionRaw(ctx, { userId: "player_1", days: 7 }),
    ).resolves.toEqual([]);
  });

  it("never creates a Profile row (read-only, unlike getOrCreateProfile)", async () => {
    const insert = vi.fn();
    const { ctx } = makeCtx({ profile: undefined });
    (ctx.db as unknown as { insert: typeof insert }).insert = insert;
    await queryHabitCompletionRaw(ctx, { userId: "player_1", days: 7 });
    expect(insert).not.toHaveBeenCalled();
  });

  it("maps raw rows into typed, numeric-count HabitCompletionRawRow entries", async () => {
    const { ctx } = makeCtx({
      profile: { timezone: "America/Chicago" },
      rows: [
        {
          habitId: "habit_1",
          definitionId: "def_1",
          status: "done",
          count: "3",
        },
        {
          habitId: "habit_1",
          definitionId: "def_1",
          status: "skipped",
          count: "1",
        },
      ],
    });

    const result = await queryHabitCompletionRaw(ctx, {
      userId: "player_1",
      days: 7,
    });

    expect(result).toEqual([
      { habitId: "habit_1", definitionId: "def_1", status: "done", count: 3 },
      {
        habitId: "habit_1",
        definitionId: "def_1",
        status: "skipped",
        count: 1,
      },
    ]);
  });
});
