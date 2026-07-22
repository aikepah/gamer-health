import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import type { GoalRow } from "./common";
import { createGoal } from "./createGoal";

function makeCtx(config: {
  callerId?: string;
  callerRole?: "player" | "coach" | "admin";
  relationship?: { id: string } | undefined;
  openCount?: number;
  insertedRow?: GoalRow;
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue({
      role: config.callerRole ?? "coach",
      deactivatedAt: null,
    });
  const relationshipFindFirst = vi.fn().mockResolvedValue(config.relationship);

  const selectWhere = vi
    .fn()
    .mockResolvedValue([{ count: String(config.openCount ?? 0) }]);
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  const returning = vi
    .fn()
    .mockResolvedValue(config.insertedRow ? [config.insertedRow] : []);
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachingRelationship: { findFirst: relationshipFindFirst },
    },
    select,
    insert,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "coach_1" } as ServiceCtx,
    values,
  };
}

const baseInput = {
  playerUserId: "player_1",
  title: "Sleep by 11pm",
  description: null,
  targetDate: null,
};

describe("createGoal", () => {
  it("throws CoreError(FORBIDDEN) when the caller isn't a coach", async () => {
    const { ctx } = makeCtx({ callerRole: "player" });
    await expect(createGoal(ctx, baseInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws CoreError(FORBIDDEN) when there's no active relationship with this player", async () => {
    const { ctx } = makeCtx({ relationship: undefined });
    await expect(createGoal(ctx, baseInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws CoreError(CONFLICT) at the 50-open-goal cap", async () => {
    const { ctx } = makeCtx({
      relationship: { id: "rel_1" },
      openCount: 50,
    });
    await expect(createGoal(ctx, baseInput)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("inserts an open goal stamped with the coach and active relationship", async () => {
    const insertedRow = {
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
    } as GoalRow;
    const { ctx, values } = makeCtx({
      relationship: { id: "rel_1" },
      openCount: 3,
      insertedRow,
    });

    const result = await createGoal(ctx, {
      playerUserId: "player_1",
      title: "Sleep by 11pm",
      description: "Wind down earlier",
      targetDate: "2026-08-01",
    });

    expect(result).toEqual(insertedRow);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        playerUserId: "player_1",
        assignedByUserId: "coach_1",
        relationshipId: "rel_1",
        title: "Sleep by 11pm",
        description: "Wind down earlier",
        targetDate: "2026-08-01",
        status: "open",
      }),
    );
  });

  it("stamps relationshipId null when no active relationship row was found by findActiveRelationship despite assertCoachOf passing", async () => {
    // assertCoachOf and findActiveRelationship both query CoachingRelationship;
    // this covers the (unlikely but handled) case where the second lookup
    // races to null between them.
    const relationshipFindFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: "rel_1" })
      .mockResolvedValueOnce(undefined);
    const profileFindFirst = vi
      .fn()
      .mockResolvedValue({ role: "coach", deactivatedAt: null });
    const selectWhere = vi.fn().mockResolvedValue([{ count: "0" }]);
    const select = vi.fn(() => ({
      from: vi.fn(() => ({ where: selectWhere })),
    }));
    const insertedRow = {
      id: "goal_1",
      playerUserId: "player_1",
      assignedByUserId: "coach_1",
      relationshipId: null,
      title: "Sleep by 11pm",
      description: null,
      targetDate: null,
      status: "open",
      progressNote: null,
      closedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as GoalRow;
    const returning = vi.fn().mockResolvedValue([insertedRow]);
    const values = vi.fn(() => ({ returning }));
    const insert = vi.fn(() => ({ values }));

    const db = {
      query: {
        Profile: { findFirst: profileFindFirst },
        CoachingRelationship: { findFirst: relationshipFindFirst },
      },
      select,
      insert,
    } as unknown as ServiceCtx["db"];
    const ctx = { db, userId: "coach_1" } as ServiceCtx;

    const result = await createGoal(ctx, baseInput);
    expect(result.relationshipId).toBeNull();
  });
});
