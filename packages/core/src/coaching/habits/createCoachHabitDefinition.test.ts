import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { createCoachHabitDefinition } from "./createCoachHabitDefinition";

function makeCtx(options: {
  role?: "player" | "coach" | "admin";
  existingCount?: number;
  returning?: unknown[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue({
    role: options.role ?? "coach",
    deactivatedAt: null,
  });

  const selectWhere = vi
    .fn()
    .mockResolvedValue([{ value: options.existingCount ?? 0 }]);
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
  const select = vi.fn().mockReturnValue({ from: selectFrom });

  const returning = vi.fn().mockResolvedValue(
    options.returning ?? [
      {
        id: "def_1",
        slug: null,
        title: "Protein with lunch",
        description: "Eat protein",
        promptText: "Eat protein",
        triggerType: "daily_schedule",
        defaultConfig: { timeOfDay: "12:30" },
        isDefault: false,
        createdByUserId: "coach_1",
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  );
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });

  const db = {
    query: { Profile: { findFirst: profileFindFirst } },
    select,
    insert,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "coach_1" } as ServiceCtx, values, insert };
}

const validInput = {
  title: "Protein with lunch",
  description: "Eat protein",
  promptText: "Eat protein",
  triggerType: "daily_schedule" as const,
  defaultConfig: { timeOfDay: "12:30" },
};

describe("createCoachHabitDefinition", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach", async () => {
    const { ctx } = makeCtx({ role: "player" });
    await expect(
      createCoachHabitDefinition(ctx, validInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(BAD_REQUEST) for a config missing what the trigger type requires", async () => {
    const { ctx } = makeCtx({});
    await expect(
      createCoachHabitDefinition(ctx, { ...validInput, defaultConfig: {} }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws CoreError(CONFLICT) at the 50-definition cap", async () => {
    const { ctx, insert } = makeCtx({ existingCount: 50 });
    await expect(
      createCoachHabitDefinition(ctx, validInput),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts with slug null, isDefault false, createdByUserId the caller", async () => {
    const { ctx, values } = makeCtx({});
    await createCoachHabitDefinition(ctx, validInput);
    const inserted = values.mock.calls[0]?.[0] as {
      slug: null;
      isDefault: boolean;
      createdByUserId: string;
    };
    expect(inserted.slug).toBeNull();
    expect(inserted.isDefault).toBe(false);
    expect(inserted.createdByUserId).toBe("coach_1");
  });

  it("returns the inserted row", async () => {
    const { ctx } = makeCtx({});
    const result = await createCoachHabitDefinition(ctx, validInput);
    expect(result.title).toBe("Protein with lunch");
  });
});
