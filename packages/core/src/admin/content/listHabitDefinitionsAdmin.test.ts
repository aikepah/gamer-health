import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { listHabitDefinitionsAdmin } from "./listHabitDefinitionsAdmin";

interface ProfileSnapshot {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

interface DefRow {
  id: string;
  slug: string | null;
  title: string;
  archivedAt: Date | null;
}

function makeCtx(config: {
  actorProfile?: ProfileSnapshot;
  defs?: DefRow[];
  instanceAgg?: { definitionId: string; value: number }[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(config.actorProfile);
  const defFindMany = vi.fn().mockResolvedValue(config.defs ?? []);

  const groupBy = vi.fn().mockResolvedValue(config.instanceAgg ?? []);
  const select = vi.fn(() => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy,
  }));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      HabitDefinition: { findMany: defFindMany },
    },
    select,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "admin_1" } as ServiceCtx };
}

describe("listHabitDefinitionsAdmin", () => {
  it("throws CoreError(FORBIDDEN) for a non-admin", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "player", deactivatedAt: null },
    });
    await expect(listHabitDefinitionsAdmin(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("orders active definitions first, then alphabetically by title", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      defs: [
        {
          id: "d1",
          slug: "hydrate",
          title: "Hydration Reminder",
          archivedAt: new Date(),
        },
        { id: "d2", slug: null, title: "Eat a real meal", archivedAt: null },
        {
          id: "d3",
          slug: "break_interval",
          title: "Break Reminder",
          archivedAt: null,
        },
      ],
    });

    const result = await listHabitDefinitionsAdmin(ctx);

    expect(result.map((r) => r.id)).toEqual(["d3", "d2", "d1"]);
  });

  it("attaches instance counts per definition, defaulting to zero", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      defs: [
        {
          id: "d1",
          slug: "hydrate",
          title: "Hydration Reminder",
          archivedAt: null,
        },
      ],
      instanceAgg: [{ definitionId: "d1", value: 4 }],
    });

    const result = await listHabitDefinitionsAdmin(ctx);

    expect(result[0]?.instanceCount).toBe(4);
  });

  it("returns an empty array with no instance-count query when there are no definitions", async () => {
    const { ctx } = makeCtx({
      actorProfile: { role: "admin", deactivatedAt: null },
      defs: [],
    });

    const result = await listHabitDefinitionsAdmin(ctx);

    expect(result).toEqual([]);
  });
});
