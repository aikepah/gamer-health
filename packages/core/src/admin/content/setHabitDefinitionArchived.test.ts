import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { setHabitDefinitionArchived } from "./setHabitDefinitionArchived";

interface ProfileSnapshot {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

interface DefRow {
  id: string;
  title: string;
  archivedAt: Date | null;
}

function makeCtx(config: {
  actorProfile?: ProfileSnapshot;
  existing?: DefRow;
  updateResult?: DefRow[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(config.actorProfile);
  const defFindFirst = vi.fn().mockResolvedValue(config.existing);

  const auditInsertValues = vi.fn();
  const updateSet = vi.fn();
  const update = vi.fn(() => ({
    set: vi.fn((vals: Record<string, unknown>) => {
      updateSet(vals);
      return {
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue(config.updateResult ?? []),
        })),
      };
    }),
  }));
  const insert = vi.fn(() => ({
    values: vi.fn((vals: Record<string, unknown>) => {
      auditInsertValues(vals);
      return Promise.resolve(undefined);
    }),
  }));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      HabitDefinition: { findFirst: defFindFirst },
    },
    update,
    insert,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: "admin_1" } as ServiceCtx,
    auditInsertValues,
    updateSet,
  };
}

describe("setHabitDefinitionArchived", () => {
  it("throws CoreError(FORBIDDEN) for a non-admin", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "player", deactivatedAt: null },
    });
    await expect(
      setHabitDefinitionArchived(ctx, { id: "def_1", archived: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(NOT_FOUND) when the definition doesn't exist", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing: undefined,
    });
    await expect(
      setHabitDefinitionArchived(ctx, { id: "missing", archived: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is a no-op (no audit row) when already archived", async () => {
    const existing = {
      id: "def_1",
      title: "Hydration Reminder",
      archivedAt: new Date(),
    };
    const { ctx, auditInsertValues, updateSet } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing,
    });

    const result = await setHabitDefinitionArchived(ctx, {
      id: "def_1",
      archived: true,
    });

    expect(result).toEqual(existing);
    expect(updateSet).not.toHaveBeenCalled();
    expect(auditInsertValues).not.toHaveBeenCalled();
  });

  it("is a no-op (no audit row) when already active and unarchiving", async () => {
    const existing = {
      id: "def_1",
      title: "Hydration Reminder",
      archivedAt: null,
    };
    const { ctx, auditInsertValues, updateSet } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing,
    });

    const result = await setHabitDefinitionArchived(ctx, {
      id: "def_1",
      archived: false,
    });

    expect(result).toEqual(existing);
    expect(updateSet).not.toHaveBeenCalled();
    expect(auditInsertValues).not.toHaveBeenCalled();
  });

  it("archives and audits habit_def_archive", async () => {
    const existing = {
      id: "def_1",
      title: "Hydration Reminder",
      archivedAt: null,
    };
    const updated = {
      id: "def_1",
      title: "Hydration Reminder",
      archivedAt: new Date(),
    };
    const { ctx, auditInsertValues } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing,
      updateResult: [updated],
    });

    const result = await setHabitDefinitionArchived(ctx, {
      id: "def_1",
      archived: true,
    });

    expect(result).toEqual(updated);
    expect(auditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "habit_def_archive" }),
    );
  });

  it("unarchives and audits habit_def_unarchive", async () => {
    const existing = {
      id: "def_1",
      title: "Hydration Reminder",
      archivedAt: new Date(),
    };
    const updated = {
      id: "def_1",
      title: "Hydration Reminder",
      archivedAt: null,
    };
    const { ctx, auditInsertValues } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing,
      updateResult: [updated],
    });

    const result = await setHabitDefinitionArchived(ctx, {
      id: "def_1",
      archived: false,
    });

    expect(result).toEqual(updated);
    expect(auditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "habit_def_unarchive" }),
    );
  });
});
