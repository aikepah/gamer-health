import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { deleteHabitDefinition } from "./deleteHabitDefinition";

interface ProfileSnapshot {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

interface DefRow {
  id: string;
  slug: string | null;
  title: string;
}

function makeCtx(config: {
  actorProfile?: ProfileSnapshot;
  existing?: DefRow;
  instanceCount?: number;
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(config.actorProfile);
  const defFindFirst = vi.fn().mockResolvedValue(config.existing);

  const countWhere = vi
    .fn()
    .mockResolvedValue([{ value: config.instanceCount ?? 0 }]);
  const select = vi.fn(() => ({
    from: vi.fn().mockReturnThis(),
    where: countWhere,
  }));

  const auditInsertValues = vi.fn();
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const tx = {
    delete: vi.fn(() => ({ where: deleteWhere })),
    insert: vi.fn(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        auditInsertValues(vals);
        return Promise.resolve(undefined);
      }),
    })),
  };

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      HabitDefinition: { findFirst: defFindFirst },
    },
    select,
    transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: "admin_1" } as ServiceCtx,
    auditInsertValues,
    deleteWhere,
  };
}

describe("deleteHabitDefinition", () => {
  it("throws CoreError(FORBIDDEN) for a non-admin", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "player", deactivatedAt: null },
    });
    await expect(
      deleteHabitDefinition(ctx, { id: "def_1" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws CoreError(NOT_FOUND) when the definition doesn't exist", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing: undefined,
    });
    await expect(
      deleteHabitDefinition(ctx, { id: "missing" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws CoreError(CONFLICT) for a built-in definition (slug != null), never deleting it", async () => {
    const { ctx, deleteWhere } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing: { id: "def_1", slug: "hydrate", title: "Hydration Reminder" },
    });
    await expect(
      deleteHabitDefinition(ctx, { id: "def_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("archive instead") as string,
    });
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it("throws CoreError(CONFLICT) when the definition has existing instances", async () => {
    const { ctx, deleteWhere } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing: { id: "def_1", slug: null, title: "Eat a real meal" },
      instanceCount: 2,
    });
    await expect(
      deleteHabitDefinition(ctx, { id: "def_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it("deletes a non-built-in, zero-instance definition and audits habit_def_delete", async () => {
    const { ctx, auditInsertValues, deleteWhere } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing: { id: "def_1", slug: null, title: "Eat a real meal" },
      instanceCount: 0,
    });

    await deleteHabitDefinition(ctx, { id: "def_1" });

    expect(deleteWhere).toHaveBeenCalled();
    expect(auditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "habit_def_delete",
        meta: { title: "Eat a real meal" },
      }),
    );
  });
});
