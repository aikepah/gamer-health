import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { setCoachHabitDefinitionArchived } from "./setCoachHabitDefinitionArchived";

interface DefRow {
  id: string;
  title: string;
  isDefault: boolean;
  createdByUserId: string | null;
  archivedAt: Date | null;
}

function makeDef(overrides: Partial<DefRow> = {}): DefRow {
  return {
    id: "def_1",
    title: "Evening mobility",
    isDefault: false,
    createdByUserId: "coach_1",
    archivedAt: null,
    ...overrides,
  };
}

function makeCtx(config: {
  role?: "player" | "coach" | "admin";
  existing?: DefRow;
  updateResult?: DefRow[];
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue({ role: config.role ?? "coach", deactivatedAt: null });
  const defFindFirst = vi.fn().mockResolvedValue(config.existing);

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

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      HabitDefinition: { findFirst: defFindFirst },
    },
    update,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "coach_1" } as ServiceCtx, updateSet };
}

describe("setCoachHabitDefinitionArchived", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach", async () => {
    const { ctx } = makeCtx({ role: "player" });
    await expect(
      setCoachHabitDefinitionArchived(ctx, {
        definitionId: "def_1",
        archived: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(NOT_FOUND) when the definition doesn't exist", async () => {
    const { ctx } = makeCtx({ existing: undefined });
    await expect(
      setCoachHabitDefinitionArchived(ctx, {
        definitionId: "missing",
        archived: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(FORBIDDEN) for a definition created by a different coach", async () => {
    const { ctx } = makeCtx({
      existing: makeDef({ createdByUserId: "coach_2" }),
    });
    await expect(
      setCoachHabitDefinitionArchived(ctx, {
        definitionId: "def_1",
        archived: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(FORBIDDEN) for a default definition", async () => {
    const { ctx } = makeCtx({
      existing: makeDef({ isDefault: true, createdByUserId: null }),
    });
    await expect(
      setCoachHabitDefinitionArchived(ctx, {
        definitionId: "def_1",
        archived: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("is a no-op when already in the requested state", async () => {
    const existing = makeDef({ archivedAt: new Date() });
    const { ctx, updateSet } = makeCtx({ existing });

    const result = await setCoachHabitDefinitionArchived(ctx, {
      definitionId: "def_1",
      archived: true,
    });

    expect(result).toEqual(existing);
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("archives", async () => {
    const existing = makeDef({ archivedAt: null });
    const updated = { ...existing, archivedAt: new Date() };
    const { ctx } = makeCtx({ existing, updateResult: [updated] });

    const result = await setCoachHabitDefinitionArchived(ctx, {
      definitionId: "def_1",
      archived: true,
    });

    expect(result).toEqual(updated);
  });

  it("unarchives, never touching existing habit instances (no instance query at all)", async () => {
    const existing = makeDef({ archivedAt: new Date() });
    const updated = { ...existing, archivedAt: null };
    const { ctx } = makeCtx({ existing, updateResult: [updated] });

    const result = await setCoachHabitDefinitionArchived(ctx, {
      definitionId: "def_1",
      archived: false,
    });

    expect(result).toEqual(updated);
  });
});
