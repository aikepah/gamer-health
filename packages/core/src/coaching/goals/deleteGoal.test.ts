import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import type { GoalRow } from "./common";
import { deleteGoal } from "./deleteGoal";

function baseGoal(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: "goal_1",
    playerUserId: "player_1",
    assignedByUserId: "coach_1",
    relationshipId: "rel_1",
    title: "Sleep by 11pm",
    description: null,
    targetDate: null,
    status: "open",
    progressNote: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCtx(config: {
  callerId?: string;
  callerRole?: "player" | "coach" | "admin";
  goal?: GoalRow | undefined;
  relationship?: { id: string } | undefined;
  deletedRows?: { id: string }[];
}) {
  const goalFindFirst = vi.fn().mockResolvedValue(config.goal);
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue({
      role: config.callerRole ?? "coach",
      deactivatedAt: null,
    });
  const relationshipFindFirst = vi.fn().mockResolvedValue(config.relationship);

  const returning = vi.fn().mockResolvedValue(config.deletedRows ?? []);
  const where = vi.fn(() => ({ returning }));
  const del = vi.fn(() => ({ where }));

  const db = {
    query: {
      Goal: { findFirst: goalFindFirst },
      Profile: { findFirst: profileFindFirst },
      CoachingRelationship: { findFirst: relationshipFindFirst },
    },
    delete: del,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: config.callerId ?? "coach_1" } as ServiceCtx };
}

describe("deleteGoal", () => {
  it("throws CoreError(NOT_FOUND) when the goal doesn't exist", async () => {
    const { ctx } = makeCtx({ goal: undefined });
    await expect(deleteGoal(ctx, { goalId: "goal_1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws CoreError(FORBIDDEN) when the caller isn't the player's active coach", async () => {
    const { ctx } = makeCtx({ goal: baseGoal(), relationship: undefined });
    await expect(deleteGoal(ctx, { goalId: "goal_1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("deletes an open goal", async () => {
    const { ctx } = makeCtx({
      goal: baseGoal(),
      relationship: { id: "rel_1" },
      deletedRows: [{ id: "goal_1" }],
    });
    await expect(
      deleteGoal(ctx, { goalId: "goal_1" }),
    ).resolves.toBeUndefined();
  });

  it("throws CoreError(CONFLICT) when the goal is no longer open", async () => {
    const { ctx } = makeCtx({
      goal: baseGoal({ status: "completed", closedAt: new Date() }),
      relationship: { id: "rel_1" },
      deletedRows: [],
    });
    await expect(deleteGoal(ctx, { goalId: "goal_1" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Completed goals can't be deleted",
    });
  });
});
