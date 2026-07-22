import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import type { HabitRow } from "./assignHabitToPlayer";
import { assignHabitToPlayer } from "./assignHabitToPlayer";

interface AssignableDef {
  id: string;
  slug: string | null;
  title: string;
  triggerType: "session_interval" | "daily_schedule" | "bedtime_cutoff";
  defaultConfig: Record<string, unknown>;
  isDefault: boolean;
  createdByUserId: string | null;
  archivedAt: null;
}

const HYDRATE_DEF: AssignableDef = {
  id: "def_hydrate",
  slug: "hydrate",
  title: "Hydration Reminder",
  triggerType: "session_interval",
  defaultConfig: { intervalMinutes: 30 },
  isDefault: true,
  createdByUserId: null,
  archivedAt: null,
};

function makeHabitRow(overrides: Partial<HabitRow> = {}): HabitRow {
  return {
    id: "habit_1",
    userId: "player_1",
    definitionId: "def_hydrate",
    assignedByUserId: "coach_1",
    enabled: true,
    config: { intervalMinutes: 30 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCtx(config: {
  coachRole?: "player" | "coach" | "admin";
  relationship?: { id: string } | undefined;
  defs?: (typeof HYDRATE_DEF)[];
  returning?: HabitRow[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue({
    role: config.coachRole ?? "coach",
    deactivatedAt: null,
  });
  const relationshipFindFirst = vi
    .fn()
    .mockResolvedValue(config.relationship);
  const defFindMany = vi.fn().mockResolvedValue(config.defs ?? [HYDRATE_DEF]);

  const returning = vi
    .fn()
    .mockResolvedValue(config.returning ?? [makeHabitRow()]);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = vi.fn().mockReturnValue({ values });

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachingRelationship: { findFirst: relationshipFindFirst },
      HabitDefinition: { findMany: defFindMany },
    },
    insert,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: "coach_1" } as ServiceCtx,
    values,
    onConflictDoUpdate,
    insert,
  };
}

const baseInput = { playerUserId: "player_1", definitionId: "def_hydrate" };

describe("assignHabitToPlayer", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach (assertCoachOf)", async () => {
    const { ctx } = makeCtx({ coachRole: "admin" });
    await expect(assignHabitToPlayer(ctx, baseInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws CoreError(FORBIDDEN) when there's no active relationship to the player", async () => {
    const { ctx } = makeCtx({ relationship: undefined });
    await expect(assignHabitToPlayer(ctx, baseInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws CoreError(NOT_FOUND) for a definition outside the assignable set (e.g. another coach's custom definition)", async () => {
    const { ctx, insert } = makeCtx({
      relationship: { id: "rel_1" },
      defs: [], // assignable set doesn't include the requested definitionId
    });
    await expect(assignHabitToPlayer(ctx, baseInput)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("throws CoreError(BAD_REQUEST) when the merged config is missing a required key", async () => {
    const dailyDef = {
      ...HYDRATE_DEF,
      id: "def_daily",
      slug: null,
      triggerType: "daily_schedule" as const,
      defaultConfig: {},
      isDefault: false,
      createdByUserId: "coach_1",
    };
    const { ctx } = makeCtx({
      relationship: { id: "rel_1" },
      defs: [dailyDef],
    });
    await expect(
      assignHabitToPlayer(ctx, { ...baseInput, definitionId: "def_daily" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("upserts on (userId, definitionId), enabling and stamping assignedByUserId with the caller", async () => {
    const { ctx, values, onConflictDoUpdate } = makeCtx({
      relationship: { id: "rel_1" },
    });

    await assignHabitToPlayer(ctx, baseInput);

    const inserted = values.mock.calls[0]?.[0] as {
      userId: string;
      definitionId: string;
      enabled: boolean;
      assignedByUserId: string;
    };
    expect(inserted).toMatchObject({
      userId: "player_1",
      definitionId: "def_hydrate",
      enabled: true,
      assignedByUserId: "coach_1",
    });

    const conflictArg = onConflictDoUpdate.mock.calls[0]?.[0] as {
      target: unknown[];
      set: { enabled: boolean; assignedByUserId: string };
    };
    expect(conflictArg.target).toHaveLength(2);
    expect(conflictArg.set).toMatchObject({
      enabled: true,
      assignedByUserId: "coach_1",
    });
  });

  it("merges the coach's config override over the definition default", async () => {
    const { ctx, values } = makeCtx({ relationship: { id: "rel_1" } });
    await assignHabitToPlayer(ctx, {
      ...baseInput,
      config: { intervalMinutes: 45 },
    });
    const inserted = values.mock.calls[0]?.[0] as {
      config: { intervalMinutes: number };
    };
    expect(inserted.config).toEqual({ intervalMinutes: 45 });
  });

  it("throws CoreError(CONFLICT) if the upsert returns no row", async () => {
    const { ctx } = makeCtx({ relationship: { id: "rel_1" }, returning: [] });
    await expect(assignHabitToPlayer(ctx, baseInput)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("returns the saved row", async () => {
    const saved = makeHabitRow({ id: "habit_saved" });
    const { ctx } = makeCtx({
      relationship: { id: "rel_1" },
      returning: [saved],
    });
    await expect(assignHabitToPlayer(ctx, baseInput)).resolves.toBe(saved);
  });
});
