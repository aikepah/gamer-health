import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { createHabitDefinition } from "./createHabitDefinition";

interface ProfileSnapshot {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

function makeCtx(config: {
  actorProfile?: ProfileSnapshot;
  insertReturning?: Record<string, unknown>[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(config.actorProfile);

  const auditInsertValues = vi.fn();
  const insertValues = vi.fn();
  const insert = vi.fn(() => ({
    values: vi.fn((vals: Record<string, unknown>) => {
      // Distinguish HabitDefinition insert from the audit insert by shape:
      // the audit insert always carries an `action` key.
      if ("action" in vals) {
        auditInsertValues(vals);
        return Promise.resolve(undefined);
      }
      insertValues(vals);
      return {
        returning: vi.fn().mockResolvedValue(config.insertReturning ?? []),
      };
    }),
  }));

  const db = {
    query: { Profile: { findFirst: profileFindFirst } },
    insert,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: "admin_1" } as ServiceCtx,
    auditInsertValues,
    insertValues,
  };
}

describe("createHabitDefinition", () => {
  it("throws CoreError(FORBIDDEN) for a non-admin", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "player", deactivatedAt: null },
    });
    await expect(
      createHabitDefinition(ctx, {
        title: "Eat a real meal",
        description: "Step away and eat something that isn't a snack.",
        promptText: "Time for a real meal",
        triggerType: "daily_schedule",
        defaultConfig: { timeOfDay: "12:30" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(BAD_REQUEST) when defaultConfig doesn't match triggerType", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
    });
    await expect(
      createHabitDefinition(ctx, {
        title: "Eat a real meal",
        description: "Step away and eat something that isn't a snack.",
        promptText: "Time for a real meal",
        triggerType: "daily_schedule",
        defaultConfig: {},
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("inserts with slug null, isDefault true, createdByUserId the actor, and audits habit_def_create", async () => {
    const created = {
      id: "def_1",
      slug: null,
      title: "Eat a real meal",
      isDefault: true,
      createdByUserId: "admin_1",
    };
    const { ctx, auditInsertValues, insertValues } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      insertReturning: [created],
    });

    const result = await createHabitDefinition(ctx, {
      title: "Eat a real meal",
      description: "Step away and eat something that isn't a snack.",
      promptText: "Time for a real meal",
      triggerType: "daily_schedule",
      defaultConfig: { timeOfDay: "12:30" },
    });

    expect(result).toEqual(created);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: null,
        isDefault: true,
        createdByUserId: "admin_1",
      }),
    );
    expect(auditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin_1",
        action: "habit_def_create",
        meta: { title: "Eat a real meal" },
      }),
    );
  });
});
