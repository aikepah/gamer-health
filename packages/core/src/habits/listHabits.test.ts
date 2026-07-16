import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { HabitRow } from "./upsertHabit";
import { HABIT_KINDS } from "./definitions";
import { listHabits } from "./listHabits";

function makeHabitRow(overrides: Partial<HabitRow> = {}): HabitRow {
  return {
    id: "habit_1",
    userId: "user_1",
    kind: "hydrate",
    triggerType: "session_interval",
    enabled: true,
    config: { intervalMinutes: 15 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCtx(options: { userId: string | null; rows?: HabitRow[] }): {
  ctx: ServiceCtx;
  findMany: ReturnType<typeof vi.fn>;
} {
  const findMany = vi.fn().mockResolvedValue(options.rows ?? []);
  const db = { query: { Habit: { findMany } } } as unknown as ServiceCtx["db"];
  return { ctx: { db, userId: options.userId }, findMany };
}

describe("listHabits", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx, findMany } = makeCtx({ userId: null });
    await expect(listHabits(ctx)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns one entry per catalog kind, in HABIT_KINDS order", async () => {
    const { ctx } = makeCtx({ userId: "user_1", rows: [] });
    const result = await listHabits(ctx);
    expect(result.map((r) => r.kind)).toEqual(HABIT_KINDS);
  });

  it("marks kinds without a row as disabled, with the default config", async () => {
    const { ctx } = makeCtx({ userId: "user_1", rows: [] });
    const result = await listHabits(ctx);
    const stretch = result.find((r) => r.kind === "stretch");
    expect(stretch).toMatchObject({
      enabled: false,
      habitId: null,
      config: { intervalMinutes: 60 },
    });
  });

  it("uses the user's row for enabled state, config, and habitId", async () => {
    const row = makeHabitRow({
      id: "habit_hydrate",
      kind: "hydrate",
      enabled: true,
      config: { intervalMinutes: 20 },
    });
    const { ctx } = makeCtx({ userId: "user_1", rows: [row] });
    const result = await listHabits(ctx);
    const hydrate = result.find((r) => r.kind === "hydrate");
    expect(hydrate).toMatchObject({
      enabled: true,
      habitId: "habit_hydrate",
      config: { intervalMinutes: 20 },
    });
  });
});
