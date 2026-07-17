import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { HabitRow } from "./upsertHabit";
import { upsertHabit } from "./upsertHabit";

function makeHabitRow(overrides: Partial<HabitRow> = {}): HabitRow {
  return {
    id: "habit_1",
    userId: "user_1",
    kind: "hydrate",
    triggerType: "session_interval",
    definitionId: null,
    assignedByUserId: null,
    enabled: true,
    config: { intervalMinutes: 30 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCtx(options: { userId: string | null; returning?: HabitRow[] }): {
  ctx: ServiceCtx;
  values: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
} {
  const returning = vi
    .fn()
    .mockResolvedValue(options.returning ?? [makeHabitRow()]);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = vi.fn().mockReturnValue({ values });
  const db = { insert } as unknown as ServiceCtx["db"];
  return { ctx: { db, userId: options.userId }, values, onConflictDoUpdate };
}

describe("upsertHabit", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx, values } = makeCtx({ userId: null });
    await expect(
      upsertHabit(ctx, { kind: "hydrate", enabled: true }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(values).not.toHaveBeenCalled();
  });

  it("forces triggerType from the catalog, ignoring anything client-supplied", async () => {
    const { ctx, values } = makeCtx({ userId: "user_1" });
    await upsertHabit(ctx, { kind: "hydrate", enabled: true });
    const insertedValues = values.mock.calls[0]?.[0] as {
      triggerType: string;
    };
    expect(insertedValues.triggerType).toBe("session_interval");
  });

  it("merges partial config over the kind's default config", async () => {
    const { ctx, values } = makeCtx({ userId: "user_1" });
    await upsertHabit(ctx, {
      kind: "bedtime_cutoff",
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

  it("upserts on the (userId, kind) unique index", async () => {
    const { ctx, onConflictDoUpdate } = makeCtx({ userId: "user_1" });
    await upsertHabit(ctx, { kind: "hydrate", enabled: false });
    const arg = onConflictDoUpdate.mock.calls[0]?.[0] as {
      target: unknown[];
      set: { enabled: boolean };
    };
    expect(arg.target).toHaveLength(2);
    expect(arg.set.enabled).toBe(false);
  });

  it("returns the saved row", async () => {
    const saved = makeHabitRow({ id: "habit_saved" });
    const { ctx } = makeCtx({ userId: "user_1", returning: [saved] });
    await expect(
      upsertHabit(ctx, { kind: "hydrate", enabled: true }),
    ).resolves.toBe(saved);
  });

  it("throws CoreError(CONFLICT) if the upsert returns no row", async () => {
    const { ctx } = makeCtx({ userId: "user_1", returning: [] });
    await expect(
      upsertHabit(ctx, { kind: "hydrate", enabled: true }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
