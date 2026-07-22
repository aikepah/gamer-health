import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import type { GoalRow } from "./common";
import { updateGoal, updateGoalInput } from "./updateGoal";

function baseGoal(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: "goal_1",
    playerUserId: "player_1",
    assignedByUserId: "coach_1",
    relationshipId: "rel_1",
    title: "Sleep by 11pm",
    description: "Old description",
    targetDate: "2026-08-01",
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
  updatedRow?: GoalRow;
}) {
  const goalFindFirst = vi.fn().mockResolvedValue(config.goal);
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue({
      role: config.callerRole ?? "coach",
      deactivatedAt: null,
    });
  const relationshipFindFirst = vi.fn().mockResolvedValue(config.relationship);

  const returning = vi
    .fn()
    .mockResolvedValue(config.updatedRow ? [config.updatedRow] : []);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
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
    ctx: { db, userId: config.callerId ?? "coach_1" } as ServiceCtx,
    set,
  };
}

describe("updateGoal", () => {
  it("throws CoreError(NOT_FOUND) when the goal doesn't exist", async () => {
    const { ctx } = makeCtx({ goal: undefined });
    await expect(
      updateGoal(ctx, { goalId: "goal_1", title: "New title" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(FORBIDDEN) when the caller isn't the player's active coach", async () => {
    const { ctx } = makeCtx({ goal: baseGoal(), relationship: undefined });
    await expect(
      updateGoal(ctx, { goalId: "goal_1", title: "New title" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("patches only the provided keys", async () => {
    const updatedRow = baseGoal({ title: "New title" });
    const { ctx, set } = makeCtx({
      goal: baseGoal(),
      relationship: { id: "rel_1" },
      updatedRow,
    });

    const result = await updateGoal(ctx, {
      goalId: "goal_1",
      title: "New title",
    });

    expect(result).toEqual(updatedRow);
    expect(set).toHaveBeenCalledWith({ title: "New title" });
  });

  it("clears a field when explicitly passed null", async () => {
    const updatedRow = baseGoal({ description: null });
    const { ctx, set } = makeCtx({
      goal: baseGoal(),
      relationship: { id: "rel_1" },
      updatedRow,
    });

    await updateGoal(ctx, { goalId: "goal_1", description: null });

    expect(set).toHaveBeenCalledWith({ description: null });
  });

  it("collapses an empty-string description to null via the input schema", async () => {
    const updatedRow = baseGoal({ description: null });
    const { ctx, set } = makeCtx({
      goal: baseGoal(),
      relationship: { id: "rel_1" },
      updatedRow,
    });

    // The core function trusts already-parsed input (the tRPC router does the
    // parsing) — exercise the schema explicitly to prove "" collapses to null.
    const parsed = updateGoalInput.parse({
      goalId: "11111111-1111-4111-8111-111111111111",
      description: "",
    });
    expect(parsed.description).toBeNull();

    await updateGoal(ctx, parsed);

    expect(set).toHaveBeenCalledWith({ description: null });
  });

  it("leaves omitted fields untouched in the parsed input (undefined, not null)", () => {
    const parsed = updateGoalInput.parse({
      goalId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parsed.description).toBeUndefined();
    expect(parsed.targetDate).toBeUndefined();
  });

  it("returns the goal unchanged (no write) when no fields are provided", async () => {
    const goal = baseGoal();
    const { ctx, set } = makeCtx({ goal, relationship: { id: "rel_1" } });

    const result = await updateGoal(ctx, { goalId: "goal_1" });

    expect(result).toEqual(goal);
    expect(set).not.toHaveBeenCalled();
  });

  it("allows editing a completed goal (no status restriction on edit)", async () => {
    const goal = baseGoal({ status: "completed", closedAt: new Date() });
    const updatedRow = { ...goal, title: "Fixed typo" };
    const { ctx } = makeCtx({
      goal,
      relationship: { id: "rel_1" },
      updatedRow,
    });

    const result = await updateGoal(ctx, {
      goalId: "goal_1",
      title: "Fixed typo",
    });
    expect(result.title).toBe("Fixed typo");
  });
});
