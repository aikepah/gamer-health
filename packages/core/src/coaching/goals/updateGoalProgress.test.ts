import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import type { GoalRow } from "./common";
import {
  updateGoalProgress,
  updateGoalProgressInput,
} from "./updateGoalProgress";

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
  goal?: GoalRow | undefined;
  updatedRow?: GoalRow;
  /** Drives `requireActiveUser`; a deactivated caller must be rejected. */
  authzProfile?: {
    role: "player" | "coach" | "admin";
    deactivatedAt: Date | null;
  };
}) {
  const goalFindFirst = vi.fn().mockResolvedValue(config.goal);
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue(
      config.authzProfile ?? { role: "player", deactivatedAt: null },
    );
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
    },
    update,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "player_1" } as ServiceCtx,
    set,
    where,
  };
}

describe("updateGoalProgress", () => {
  it("throws CoreError(NOT_FOUND) when the goal doesn't exist", async () => {
    const { ctx } = makeCtx({ goal: undefined });
    await expect(
      updateGoalProgress(ctx, { goalId: "goal_1", progressNote: "Doing okay" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(NOT_FOUND) when the goal belongs to another player", async () => {
    const { ctx } = makeCtx({
      callerId: "someone_else",
      goal: baseGoal({ playerUserId: "player_1" }),
    });
    await expect(
      updateGoalProgress(ctx, { goalId: "goal_1", progressNote: "Doing okay" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lets the player set their own progress note", async () => {
    const updatedRow = baseGoal({ progressNote: "Doing okay" });
    const { ctx, set } = makeCtx({ goal: baseGoal(), updatedRow });

    const result = await updateGoalProgress(ctx, {
      goalId: "goal_1",
      progressNote: "Doing okay",
    });

    expect(result).toEqual(updatedRow);
    expect(set).toHaveBeenCalledWith({ progressNote: "Doing okay" });
  });

  it("collapses an empty-string note to null via the input schema", () => {
    const parsed = updateGoalProgressInput.parse({
      goalId: "11111111-1111-4111-8111-111111111111",
      progressNote: "",
    });
    expect(parsed.progressNote).toBeNull();
  });

  it("collapses an omitted note to null via the input schema (not a patch field)", () => {
    const parsed = updateGoalProgressInput.parse({
      goalId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parsed.progressNote).toBeNull();
  });

  it("throws FORBIDDEN for a deactivated player", async () => {
    // Regression: this used `requireUserId`, which never loads the profile,
    // so a deactivated player could still write while every sibling goal
    // service refused them.
    const { ctx } = makeCtx({
      goal: baseGoal(),
      authzProfile: { role: "player", deactivatedAt: new Date() },
    });

    await expect(
      updateGoalProgress(ctx, { goalId: "goal_1", progressNote: "hi" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("re-asserts ownership in the UPDATE, not just the preceding read", async () => {
    const goal = baseGoal();
    const { ctx, where } = makeCtx({ goal, updatedRow: goal });

    await updateGoalProgress(ctx, { goalId: "goal_1", progressNote: "hi" });

    // The write must be scoped by player as well as id: the read above is
    // not atomic with it.
    expect(where).toHaveBeenCalledTimes(1);
  });
});
