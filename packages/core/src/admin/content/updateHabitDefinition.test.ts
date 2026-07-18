import { describe, expect, it, vi } from "vitest";

import type { HabitConfig } from "@gamer-health/db/schema";
import type { HabitTriggerType } from "@gamer-health/validators";

import type { ServiceCtx } from "../../ctx";
import { updateHabitDefinition } from "./updateHabitDefinition";

interface ProfileSnapshot {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

interface DefRow {
  id: string;
  slug: string | null;
  title: string;
  description: string;
  promptText: string;
  triggerType: HabitTriggerType;
  defaultConfig: HabitConfig;
  archivedAt: Date | null;
}

function makeDef(overrides: Partial<DefRow> = {}): DefRow {
  return {
    id: "def_1",
    slug: "hydrate",
    title: "Hydration Reminder",
    description: "Stay hydrated.",
    promptText: "Drink water",
    triggerType: "session_interval",
    defaultConfig: { intervalMinutes: 30 },
    archivedAt: null,
    ...overrides,
  };
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

describe("updateHabitDefinition", () => {
  it("throws CoreError(FORBIDDEN) for a non-admin", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "player", deactivatedAt: null },
    });
    await expect(
      updateHabitDefinition(ctx, { id: "def_1", title: "New title" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(NOT_FOUND) when the definition doesn't exist", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing: undefined,
    });
    await expect(
      updateHabitDefinition(ctx, { id: "missing", title: "New title" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("validates a given defaultConfig against the row's existing (immutable) triggerType", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing: makeDef({ triggerType: "session_interval" }),
    });
    await expect(
      updateHabitDefinition(ctx, {
        id: "def_1",
        defaultConfig: { timeOfDay: "12:00" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is a no-op returning the existing row when no fields are given", async () => {
    const existing = makeDef();
    const { ctx, updateSet } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing,
    });

    const result = await updateHabitDefinition(ctx, { id: "def_1" });

    expect(result).toEqual(existing);
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("updates only the given fields (built-ins are editable) and audits the changed field names", async () => {
    const existing = makeDef({ slug: "hydrate" }); // built-in: slug != null
    const updated = makeDef({ title: "Hydration+" });
    const { ctx, auditInsertValues, updateSet } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      existing,
      updateResult: [updated],
    });

    const result = await updateHabitDefinition(ctx, {
      id: "def_1",
      title: "Hydration+",
    });

    expect(result).toEqual(updated);
    expect(updateSet).toHaveBeenCalledWith({ title: "Hydration+" });
    expect(auditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "habit_def_update",
        meta: { fields: ["title"] },
      }),
    );
  });
});
