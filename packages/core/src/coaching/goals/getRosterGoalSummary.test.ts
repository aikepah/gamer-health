import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { getRosterGoalSummary } from "./getRosterGoalSummary";

function makeCtx(config: {
  callerRole?: "player" | "coach" | "admin";
  rows?: {
    playerUserId: string;
    open: string;
    overdue: string;
    completed: string;
  }[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue({
    role: config.callerRole ?? "coach",
    deactivatedAt: null,
  });

  const groupBy = vi.fn().mockResolvedValue(config.rows ?? []);
  const where = vi.fn(() => ({ groupBy }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  const select = vi.fn(() => ({ from }));

  const db = {
    query: { Profile: { findFirst: profileFindFirst } },
    select,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "coach_1" } as ServiceCtx };
}

describe("getRosterGoalSummary", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach caller", async () => {
    const { ctx } = makeCtx({ callerRole: "player" });
    await expect(getRosterGoalSummary(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("maps grouped counts per player, coercing string counts to numbers", async () => {
    const { ctx } = makeCtx({
      rows: [
        { playerUserId: "player_1", open: "3", overdue: "1", completed: "2" },
        { playerUserId: "player_2", open: "0", overdue: "0", completed: "5" },
      ],
    });

    const result = await getRosterGoalSummary(ctx);
    expect(result).toEqual([
      { playerUserId: "player_1", open: 3, overdue: 1, completed: 2 },
      { playerUserId: "player_2", open: 0, overdue: 0, completed: 5 },
    ]);
  });
});
