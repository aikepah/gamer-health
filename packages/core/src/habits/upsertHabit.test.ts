import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { HabitRow } from "./upsertHabit";
import { upsertHabit } from "./upsertHabit";

type HabitDefinitionRow = Awaited<
  ReturnType<ServiceCtx["db"]["query"]["HabitDefinition"]["findFirst"]>
>;

function makeDefRow(
  overrides: Partial<NonNullable<HabitDefinitionRow>> = {},
): NonNullable<HabitDefinitionRow> {
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
  } as NonNullable<HabitDefinitionRow>;
}

function makeHabitRow(overrides: Partial<HabitRow> = {}): HabitRow {
  return {
    id: "habit_1",
    userId: "user_1",
    definitionId: "def_hydrate",
    assignedByUserId: null,
    enabled: true,
    config: { intervalMinutes: 30 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCtx(options: {
  userId: string | null;
  definition?: NonNullable<HabitDefinitionRow> | undefined;
  existingHabit?: HabitRow | undefined;
  returning?: HabitRow[];
}): {
  ctx: ServiceCtx;
  values: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
} {
  const defFindFirst = vi.fn().mockResolvedValue(options.definition);
  const habitFindFirst = vi.fn().mockResolvedValue(options.existingHabit);

  const returning = vi
    .fn()
    .mockResolvedValue(options.returning ?? [makeHabitRow()]);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = vi.fn().mockReturnValue({ values });

  const db = {
    query: {
      HabitDefinition: { findFirst: defFindFirst },
      Habit: { findFirst: habitFindFirst },
    },
    insert,
  } as unknown as ServiceCtx["db"];
  return { ctx: { db, userId: options.userId }, values, onConflictDoUpdate };
}

describe("upsertHabit", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx, values } = makeCtx({ userId: null });
    await expect(
      upsertHabit(ctx, { definitionId: "def_hydrate", enabled: true }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(values).not.toHaveBeenCalled();
  });

  it("throws CoreError(NOT_FOUND) when the definition doesn't exist", async () => {
    const { ctx } = makeCtx({ userId: "user_1", definition: undefined });
    await expect(
      upsertHabit(ctx, { definitionId: "def_missing", enabled: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(NOT_FOUND) for a non-default definition the caller has no instance of", async () => {
    const definition = makeDefRow({ isDefault: false });
    const { ctx } = makeCtx({
      userId: "user_1",
      definition,
      existingHabit: undefined,
    });
    await expect(
      upsertHabit(ctx, { definitionId: definition.id, enabled: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(BAD_REQUEST) when adopting an archived definition with no existing instance", async () => {
    const definition = makeDefRow({ archivedAt: new Date() });
    const { ctx } = makeCtx({
      userId: "user_1",
      definition,
      existingHabit: undefined,
    });
    await expect(
      upsertHabit(ctx, { definitionId: definition.id, enabled: true }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("allows updating an archived definition the caller already has an instance of", async () => {
    const definition = makeDefRow({ archivedAt: new Date() });
    const existingHabit = makeHabitRow({ definitionId: definition.id });
    const { ctx, values } = makeCtx({
      userId: "user_1",
      definition,
      existingHabit,
    });
    await upsertHabit(ctx, {
      definitionId: definition.id,
      enabled: false,
    });
    expect(values).toHaveBeenCalled();
  });

  it("merges partial config over the definition's default config and validates by triggerType", async () => {
    const definition = makeDefRow({
      triggerType: "bedtime_cutoff",
      defaultConfig: { bedtime: "23:00", leadMinutes: 60 },
    });
    const { ctx, values } = makeCtx({ userId: "user_1", definition });
    await upsertHabit(ctx, {
      definitionId: definition.id,
      enabled: true,
      config: { leadMinutes: 30 },
    });
    const insertedValues = values.mock.calls[0]?.[0] as {
      config: { bedtime: string; leadMinutes: number };
    };
    // bedtime comes from the default; leadMinutes is the caller's override.
    expect(insertedValues.config).toEqual({
      bedtime: "23:00",
      leadMinutes: 30,
    });
  });

  it("throws CoreError(BAD_REQUEST) when the merged config is missing a required key", async () => {
    const definition = makeDefRow({
      triggerType: "daily_schedule",
      defaultConfig: {},
    });
    const { ctx } = makeCtx({ userId: "user_1", definition });
    await expect(
      upsertHabit(ctx, { definitionId: definition.id, enabled: true }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("upserts on the (userId, definitionId) unique index", async () => {
    const definition = makeDefRow();
    const { ctx, onConflictDoUpdate } = makeCtx({
      userId: "user_1",
      definition,
    });
    await upsertHabit(ctx, {
      definitionId: definition.id,
      enabled: false,
      config: { intervalMinutes: 30 },
    });
    const arg = onConflictDoUpdate.mock.calls[0]?.[0] as {
      target: unknown[];
      set: { enabled: boolean };
    };
    expect(arg.target).toHaveLength(2);
    expect(arg.set.enabled).toBe(false);
  });

  it("returns the saved row", async () => {
    const definition = makeDefRow();
    const saved = makeHabitRow({ id: "habit_saved" });
    const { ctx } = makeCtx({
      userId: "user_1",
      definition,
      returning: [saved],
    });
    await expect(
      upsertHabit(ctx, {
        definitionId: definition.id,
        enabled: true,
        config: { intervalMinutes: 30 },
      }),
    ).resolves.toBe(saved);
  });

  it("throws CoreError(CONFLICT) if the upsert returns no row", async () => {
    const definition = makeDefRow();
    const { ctx } = makeCtx({ userId: "user_1", definition, returning: [] });
    await expect(
      upsertHabit(ctx, {
        definitionId: definition.id,
        enabled: true,
        config: { intervalMinutes: 30 },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
