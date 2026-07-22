import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import type { GoalRow } from "./common";
import { setGoalStatus } from "./setGoalStatus";

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
  deactivatedAt?: Date | null;
  goal?: GoalRow | undefined;
  relationship?: { id: string } | undefined;
  updatedRows?: GoalRow[];
}) {
  const goalFindFirst = vi.fn().mockResolvedValue(config.goal);
  const profileFindFirst = vi.fn().mockResolvedValue({
    role: config.callerRole ?? "player",
    deactivatedAt: config.deactivatedAt ?? null,
  });
  const relationshipFindFirst = vi.fn().mockResolvedValue(config.relationship);

  const returning = vi.fn().mockResolvedValue(config.updatedRows ?? []);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn((_patch: { status: string; closedAt: Date | null }) => ({
    where,
  }));
  const update = vi.fn(() => ({ set }));

  const db = {
    query: {
      Goal: { findFirst: goalFindFirst },
      Profile: { findFirst: profileFindFirst },
      CoachingRelationship: { findFirst: relationshipFindFirst },
    },
    update,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "player_1" } as ServiceCtx,
    set,
  };
}

describe("setGoalStatus", () => {
  it("throws CoreError(NOT_FOUND) when the goal doesn't exist", async () => {
    const { ctx } = makeCtx({ goal: undefined });
    await expect(
      setGoalStatus(ctx, { goalId: "goal_1", status: "completed" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows the player to change their own goal's status", async () => {
    const updated = baseGoal({ status: "completed", closedAt: new Date() });
    const { ctx, set } = makeCtx({
      callerId: "player_1",
      goal: baseGoal(),
      updatedRows: [updated],
    });

    const result = await setGoalStatus(ctx, {
      goalId: "goal_1",
      status: "completed",
    });

    expect(result).toEqual(updated);
    const arg = set.mock.calls[0]?.[0] as {
      status: string;
      closedAt: Date | null;
    };
    expect(arg.status).toBe("completed");
    expect(arg.closedAt).toBeInstanceOf(Date);
  });

  it("clears closedAt on reopen", async () => {
    const updated = baseGoal({ status: "open", closedAt: null });
    const { ctx, set } = makeCtx({
      callerId: "player_1",
      goal: baseGoal({ status: "completed", closedAt: new Date() }),
      updatedRows: [updated],
    });

    await setGoalStatus(ctx, { goalId: "goal_1", status: "open" });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "open", closedAt: null }),
    );
  });

  it("allows the player's active coach to change status", async () => {
    const updated = baseGoal({ status: "abandoned", closedAt: new Date() });
    const { ctx } = makeCtx({
      callerId: "coach_1",
      callerRole: "coach",
      goal: baseGoal(),
      relationship: { id: "rel_1" },
      updatedRows: [updated],
    });

    const result = await setGoalStatus(ctx, {
      goalId: "goal_1",
      status: "abandoned",
    });
    expect(result.status).toBe("abandoned");
  });

  it("throws a bare CoreError(FORBIDDEN) for a non-owner, non-coach caller (no leak)", async () => {
    const { ctx } = makeCtx({
      callerId: "someone_else",
      callerRole: "player",
      goal: baseGoal(),
    });

    await expect(
      setGoalStatus(ctx, { goalId: "goal_1", status: "completed" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "FORBIDDEN" });
  });

  it("throws CoreError(FORBIDDEN) for a coach without an active relationship to this player", async () => {
    const { ctx } = makeCtx({
      callerId: "coach_1",
      callerRole: "coach",
      goal: baseGoal(),
      relationship: undefined,
    });

    await expect(
      setGoalStatus(ctx, { goalId: "goal_1", status: "completed" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("is a no-op returning the goal unchanged when status is already the target", async () => {
    const goal = baseGoal({ status: "completed", closedAt: new Date() });
    const { ctx, set } = makeCtx({ callerId: "player_1", goal });

    const result = await setGoalStatus(ctx, {
      goalId: "goal_1",
      status: "completed",
    });

    expect(result).toEqual(goal);
    expect(set).not.toHaveBeenCalled();
  });

  it("throws CoreError(CONFLICT) when the conditional update matches nothing (lost race)", async () => {
    const { ctx } = makeCtx({
      callerId: "player_1",
      goal: baseGoal(),
      updatedRows: [],
    });

    await expect(
      setGoalStatus(ctx, { goalId: "goal_1", status: "completed" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
