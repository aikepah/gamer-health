import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { unassignHabitFromPlayer } from "./unassignHabitFromPlayer";

interface HabitWithDef {
  id: string;
  userId: string;
  assignedByUserId: string | null;
  definition: { isDefault: boolean };
}

function makeHabit(overrides: Partial<HabitWithDef> = {}): HabitWithDef {
  return {
    id: "habit_1",
    userId: "player_1",
    assignedByUserId: "coach_1",
    definition: { isDefault: false },
    ...overrides,
  };
}

function makeCtx(config: {
  coachRole?: "player" | "coach" | "admin";
  relationship?: { id: string } | undefined;
  habit?: HabitWithDef | undefined;
  updateResult?: { id: string }[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue({
    role: config.coachRole ?? "coach",
    deactivatedAt: null,
  });
  const relationshipFindFirst = vi
    .fn()
    .mockResolvedValue(config.relationship);
  const habitFindFirst = vi.fn().mockResolvedValue(config.habit);

  const updateSet = vi.fn();
  const returning = vi
    .fn()
    .mockResolvedValue(config.updateResult ?? [{ id: "habit_1" }]);
  const update = vi.fn(() => ({
    set: vi.fn((vals: Record<string, unknown>) => {
      updateSet(vals);
      return { where: vi.fn(() => ({ returning })) };
    }),
  }));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachingRelationship: { findFirst: relationshipFindFirst },
      Habit: { findFirst: habitFindFirst },
    },
    update,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "coach_1" } as ServiceCtx, updateSet, returning };
}

describe("unassignHabitFromPlayer", () => {
  it("throws CoreError(NOT_FOUND) when the habit doesn't exist", async () => {
    const { ctx } = makeCtx({ habit: undefined });
    await expect(
      unassignHabitFromPlayer(ctx, { habitId: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(FORBIDDEN) when the caller has no active relationship to the habit's player", async () => {
    const { ctx } = makeCtx({ habit: makeHabit(), relationship: undefined });
    await expect(
      unassignHabitFromPlayer(ctx, { habitId: "habit_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(CONFLICT) when the habit wasn't assigned by the caller", async () => {
    const { ctx } = makeCtx({
      habit: makeHabit({ assignedByUserId: "other_coach" }),
      relationship: { id: "rel_1" },
    });
    await expect(
      unassignHabitFromPlayer(ctx, { habitId: "habit_1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws CoreError(CONFLICT) for a self-adopted habit (assignedByUserId already null)", async () => {
    const { ctx } = makeCtx({
      habit: makeHabit({ assignedByUserId: null }),
      relationship: { id: "rel_1" },
    });
    await expect(
      unassignHabitFromPlayer(ctx, { habitId: "habit_1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("clears assignedByUserId and disables a coach-custom (isDefault: false) habit", async () => {
    const { ctx, updateSet } = makeCtx({
      habit: makeHabit({ definition: { isDefault: false } }),
      relationship: { id: "rel_1" },
    });
    await unassignHabitFromPlayer(ctx, { habitId: "habit_1" });
    expect(updateSet).toHaveBeenCalledWith({
      assignedByUserId: null,
      enabled: false,
    });
  });

  it("clears assignedByUserId but leaves a default-definition habit enabled (reverts to self-adopted)", async () => {
    const { ctx, updateSet } = makeCtx({
      habit: makeHabit({ definition: { isDefault: true } }),
      relationship: { id: "rel_1" },
    });
    await unassignHabitFromPlayer(ctx, { habitId: "habit_1" });
    expect(updateSet).toHaveBeenCalledWith({ assignedByUserId: null });
  });

  it("throws CoreError(CONFLICT) when the conditional update returns no row (concurrent change)", async () => {
    const { ctx } = makeCtx({
      habit: makeHabit(),
      relationship: { id: "rel_1" },
      updateResult: [],
    });
    await expect(
      unassignHabitFromPlayer(ctx, { habitId: "habit_1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
