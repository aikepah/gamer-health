import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { listPlayerHabitsForCoach } from "./listPlayerHabitsForCoach";

function makeChain(result: unknown[]) {
  const chain: {
    from: () => typeof chain;
    innerJoin: () => typeof chain;
    where: () => typeof chain;
    groupBy: (..._args: unknown[]) => Promise<unknown[]>;
  } = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    groupBy: () => Promise.resolve(result),
  };
  return chain;
}

function makeCtx(config: {
  coachRole?: "player" | "coach" | "admin";
  relationship?: { id: string } | undefined;
  habits?: {
    id: string;
    definitionId: string;
    assignedByUserId: string | null;
    enabled: boolean;
    config: Record<string, unknown>;
    definition: {
      title: string;
      triggerType: "session_interval" | "daily_schedule" | "bedtime_cutoff";
      isDefault: boolean;
    };
  }[];
  completionRows?: {
    habitId: string;
    definitionId: string;
    status: string;
    count: string;
  }[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue({
    role: config.coachRole ?? "coach",
    deactivatedAt: null,
    timezone: "America/Chicago",
  });
  const relationshipFindFirst = vi.fn().mockResolvedValue(config.relationship);
  const habitFindMany = vi.fn().mockResolvedValue(config.habits ?? []);
  const select = vi.fn(() => makeChain(config.completionRows ?? []));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachingRelationship: { findFirst: relationshipFindFirst },
      Habit: { findMany: habitFindMany },
    },
    select,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "coach_1" } as ServiceCtx, habitFindMany };
}

const baseInput = { playerUserId: "player_1", days: 7 };

describe("listPlayerHabitsForCoach", () => {
  it("throws CoreError(FORBIDDEN) with no active relationship to the player", async () => {
    const { ctx } = makeCtx({ relationship: undefined });
    await expect(
      listPlayerHabitsForCoach(ctx, baseInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("marks assignedByMe true only when the caller is the assigner", async () => {
    const { ctx } = makeCtx({
      relationship: { id: "rel_1" },
      habits: [
        {
          id: "habit_1",
          definitionId: "def_1",
          assignedByUserId: "coach_1",
          enabled: true,
          config: {},
          definition: {
            title: "Hydrate",
            triggerType: "session_interval",
            isDefault: true,
          },
        },
        {
          id: "habit_2",
          definitionId: "def_2",
          assignedByUserId: "other_coach",
          enabled: true,
          config: {},
          definition: {
            title: "Old assignment",
            triggerType: "daily_schedule",
            isDefault: false,
          },
        },
        {
          id: "habit_3",
          definitionId: "def_3",
          assignedByUserId: null,
          enabled: true,
          config: {},
          definition: {
            title: "Self-adopted",
            triggerType: "daily_schedule",
            isDefault: true,
          },
        },
      ],
    });

    const result = await listPlayerHabitsForCoach(ctx, baseInput);

    expect(result.find((r) => r.habitId === "habit_1")).toMatchObject({
      assignedByMe: true,
      assignedByUserId: "coach_1",
    });
    expect(result.find((r) => r.habitId === "habit_2")).toMatchObject({
      assignedByMe: false,
      assignedByUserId: "other_coach",
    });
    expect(result.find((r) => r.habitId === "habit_3")).toMatchObject({
      assignedByMe: false,
      assignedByUserId: null,
    });
  });

  it("surfaces isDefaultDefinition from the joined definition row", async () => {
    const { ctx } = makeCtx({
      relationship: { id: "rel_1" },
      habits: [
        {
          id: "habit_1",
          definitionId: "def_1",
          assignedByUserId: "coach_1",
          enabled: true,
          config: {},
          definition: {
            title: "Hydrate",
            triggerType: "session_interval",
            isDefault: true,
          },
        },
        {
          id: "habit_2",
          definitionId: "def_2",
          assignedByUserId: "coach_1",
          enabled: true,
          config: {},
          definition: {
            title: "Protein with lunch",
            triggerType: "daily_schedule",
            isDefault: false,
          },
        },
      ],
    });

    const result = await listPlayerHabitsForCoach(ctx, baseInput);

    expect(result.find((r) => r.habitId === "habit_1")).toMatchObject({
      isDefaultDefinition: true,
    });
    expect(result.find((r) => r.habitId === "habit_2")).toMatchObject({
      isDefaultDefinition: false,
    });
  });

  it("aggregates done/total per habitId from the raw completion rows", async () => {
    const { ctx } = makeCtx({
      relationship: { id: "rel_1" },
      habits: [
        {
          id: "habit_1",
          definitionId: "def_1",
          assignedByUserId: "coach_1",
          enabled: true,
          config: {},
          definition: {
            title: "Hydrate",
            triggerType: "session_interval",
            isDefault: true,
          },
        },
      ],
      completionRows: [
        {
          habitId: "habit_1",
          definitionId: "def_1",
          status: "done",
          count: "4",
        },
        {
          habitId: "habit_1",
          definitionId: "def_1",
          status: "skipped",
          count: "2",
        },
      ],
    });

    const result = await listPlayerHabitsForCoach(ctx, baseInput);

    expect(result[0]).toMatchObject({ done: 4, total: 6 });
  });

  it("defaults done/total to 0 for a habit with no prompts in range", async () => {
    const { ctx } = makeCtx({
      relationship: { id: "rel_1" },
      habits: [
        {
          id: "habit_1",
          definitionId: "def_1",
          assignedByUserId: null,
          enabled: false,
          config: {},
          definition: {
            title: "Hydrate",
            triggerType: "session_interval",
            isDefault: true,
          },
        },
      ],
      completionRows: [],
    });

    const result = await listPlayerHabitsForCoach(ctx, baseInput);

    expect(result[0]).toMatchObject({ done: 0, total: 0, enabled: false });
  });
});
