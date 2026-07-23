import { describe, expect, it, vi } from "vitest";

import type { HabitConfig } from "@gamer-health/db/schema";
import type { HabitTriggerType } from "@gamer-health/validators";

import type { ServiceCtx } from "../../ctx";
import { updateCoachHabitDefinition } from "./updateCoachHabitDefinition";

interface DefRow {
  id: string;
  isDefault: boolean;
  createdByUserId: string | null;
  triggerType: HabitTriggerType;
  defaultConfig: HabitConfig;
}

function makeDef(overrides: Partial<DefRow> = {}): DefRow {
  return {
    id: "def_1",
    isDefault: false,
    createdByUserId: "coach_1",
    triggerType: "daily_schedule",
    defaultConfig: { timeOfDay: "12:30" },
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

describe("updateCoachHabitDefinition", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach", async () => {
    const { ctx } = makeCtx({ role: "player" });
    await expect(
      updateCoachHabitDefinition(ctx, { id: "def_1", title: "New title" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(NOT_FOUND) when the definition doesn't exist", async () => {
    const { ctx } = makeCtx({ existing: undefined });
    await expect(
      updateCoachHabitDefinition(ctx, { id: "missing", title: "New title" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(FORBIDDEN) for a definition created by a different coach", async () => {
    const { ctx } = makeCtx({
      existing: makeDef({ createdByUserId: "coach_2" }),
    });
    await expect(
      updateCoachHabitDefinition(ctx, { id: "def_1", title: "New title" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(FORBIDDEN) for a default (non-coach-owned) definition", async () => {
    const { ctx } = makeCtx({
      existing: makeDef({ isDefault: true, createdByUserId: null }),
    });
    await expect(
      updateCoachHabitDefinition(ctx, { id: "def_1", title: "New title" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("validates a given defaultConfig against the row's existing (immutable) triggerType", async () => {
    const { ctx } = makeCtx({
      existing: makeDef({ triggerType: "session_interval" }),
    });
    await expect(
      updateCoachHabitDefinition(ctx, {
        id: "def_1",
        defaultConfig: { timeOfDay: "12:00" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is a no-op returning the existing row when no fields are given", async () => {
    const existing = makeDef();
    const { ctx, updateSet } = makeCtx({ existing });
    const result = await updateCoachHabitDefinition(ctx, { id: "def_1" });
    expect(result).toEqual(existing);
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("updates only the given fields", async () => {
    const existing = makeDef();
    const updated = { ...existing, title: "Protein at lunch" };
    const { ctx, updateSet } = makeCtx({ existing, updateResult: [updated] });

    const result = await updateCoachHabitDefinition(ctx, {
      id: "def_1",
      title: "Protein at lunch",
    });

    expect(result).toEqual(updated);
    expect(updateSet).toHaveBeenCalledWith({ title: "Protein at lunch" });
  });
});
