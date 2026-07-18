import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import { listHabits } from "./listHabits";

type HabitDefinitionRow = Awaited<
  ReturnType<ServiceCtx["db"]["query"]["HabitDefinition"]["findMany"]>
>[number];
type HabitRow = Awaited<
  ReturnType<ServiceCtx["db"]["query"]["Habit"]["findMany"]>
>[number];

function makeDefRow(
  overrides: Partial<HabitDefinitionRow> = {},
): HabitDefinitionRow {
  return {
    id: "def_hydrate",
    slug: "hydrate",
    title: "Hydration Reminder",
    description: "Stay hydrated.",
    promptText: "Drink some water",
    triggerType: "session_interval",
    defaultConfig: { intervalMinutes: 30 },
    isDefault: true,
    createdByUserId: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as HabitDefinitionRow;
}

function makeHabitRow(
  def: HabitDefinitionRow,
  overrides: Partial<Omit<HabitRow, "definition">> = {},
): HabitRow & { definition: HabitDefinitionRow } {
  return {
    id: "habit_1",
    userId: "user_1",
    definitionId: def.id,
    assignedByUserId: null,
    enabled: true,
    config: { intervalMinutes: 20 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
    definition: def,
  } as HabitRow & { definition: HabitDefinitionRow };
}

function makeCtx(options: {
  userId: string | null;
  instances?: (HabitRow & { definition: HabitDefinitionRow })[];
  catalog?: HabitDefinitionRow[];
}): {
  ctx: ServiceCtx;
  habitFindMany: ReturnType<typeof vi.fn>;
  defFindMany: ReturnType<typeof vi.fn>;
} {
  const habitFindMany = vi.fn().mockResolvedValue(options.instances ?? []);
  const defFindMany = vi.fn().mockResolvedValue(options.catalog ?? []);
  const db = {
    query: {
      Habit: { findMany: habitFindMany },
      HabitDefinition: { findMany: defFindMany },
    },
  } as unknown as ServiceCtx["db"];
  return { ctx: { db, userId: options.userId }, habitFindMany, defFindMany };
}

describe("listHabits", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx, habitFindMany } = makeCtx({ userId: null });
    await expect(listHabits(ctx)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(habitFindMany).not.toHaveBeenCalled();
  });

  it("returns one entry per default catalog definition, disabled with default config, when the user has no instances", async () => {
    const hydrate = makeDefRow();
    const stretch = makeDefRow({
      id: "def_stretch",
      slug: "stretch",
      title: "Stretch Reminder",
      defaultConfig: { intervalMinutes: 60 },
    });
    const { ctx } = makeCtx({ userId: "user_1", catalog: [hydrate, stretch] });

    const result = await listHabits(ctx);

    expect(result).toHaveLength(2);
    const stretchItem = result.find((r) => r.slug === "stretch");
    expect(stretchItem).toMatchObject({
      enabled: false,
      habitId: null,
      config: { intervalMinutes: 60 },
      archived: false,
    });
  });

  it("sorts enabled instances before the rest, then by title", async () => {
    const hydrate = makeDefRow();
    const stretch = makeDefRow({
      id: "def_stretch",
      slug: "stretch",
      title: "Stretch Reminder",
    });
    const hydrateInstance = makeHabitRow(hydrate, { enabled: true });
    const { ctx } = makeCtx({
      userId: "user_1",
      instances: [hydrateInstance],
      catalog: [hydrate, stretch],
    });

    const result = await listHabits(ctx);

    expect(result.map((r) => r.slug)).toEqual(["hydrate", "stretch"]);
  });

  it("uses the caller's instance for enabled state, config, and habitId", async () => {
    const hydrate = makeDefRow();
    const instance = makeHabitRow(hydrate, {
      id: "habit_hydrate",
      enabled: true,
      config: { intervalMinutes: 20 },
    });
    const { ctx } = makeCtx({
      userId: "user_1",
      instances: [instance],
      catalog: [hydrate],
    });

    const result = await listHabits(ctx);
    const hydrateItem = result.find((r) => r.slug === "hydrate");
    expect(hydrateItem).toMatchObject({
      enabled: true,
      habitId: "habit_hydrate",
      config: { intervalMinutes: 20 },
    });
  });

  it("includes an archived definition the caller has an instance of, with archived: true", async () => {
    const archivedDef = makeDefRow({
      id: "def_old",
      slug: "old_habit",
      title: "Old Habit",
      isDefault: true,
      archivedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const instance = makeHabitRow(archivedDef, { enabled: false });
    const { ctx } = makeCtx({
      userId: "user_1",
      instances: [instance],
      catalog: [], // no longer in the default catalog query result
    });

    const result = await listHabits(ctx);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ slug: "old_habit", archived: true });
  });
});
