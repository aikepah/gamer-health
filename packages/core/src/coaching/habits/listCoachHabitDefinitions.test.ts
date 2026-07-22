import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { listCoachHabitDefinitions } from "./listCoachHabitDefinitions";

function makeChain(result: unknown[]) {
  const chain: {
    from: () => typeof chain;
    where: () => typeof chain;
    groupBy: (..._args: unknown[]) => Promise<unknown[]>;
  } = {
    from: () => chain,
    where: () => chain,
    groupBy: () => Promise.resolve(result),
  };
  return chain;
}

function makeCtx(config: {
  role?: "player" | "coach" | "admin";
  defs?: { id: string; title: string; archivedAt: Date | null }[];
  assignedAgg?: { definitionId: string; value: number }[];
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue({ role: config.role ?? "coach", deactivatedAt: null });
  const defFindMany = vi.fn().mockResolvedValue(config.defs ?? []);
  const select = vi.fn(() => makeChain(config.assignedAgg ?? []));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      HabitDefinition: { findMany: defFindMany },
    },
    select,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "coach_1" } as ServiceCtx, defFindMany, select };
}

describe("listCoachHabitDefinitions", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach", async () => {
    const { ctx } = makeCtx({ role: "player" });
    await expect(listCoachHabitDefinitions(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("scopes the definition query to the caller and skips the aggregate query when empty", async () => {
    const { ctx, defFindMany, select } = makeCtx({ defs: [] });
    const result = await listCoachHabitDefinitions(ctx);
    expect(defFindMany).toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("attaches assignedCount per definition (0 when absent from the aggregate)", async () => {
    const { ctx } = makeCtx({
      defs: [
        { id: "def_1", title: "Protein with lunch", archivedAt: null },
        { id: "def_2", title: "Evening mobility", archivedAt: null },
      ],
      assignedAgg: [{ definitionId: "def_1", value: 3 }],
    });

    const result = await listCoachHabitDefinitions(ctx);

    expect(result.find((r) => r.id === "def_1")?.assignedCount).toBe(3);
    expect(result.find((r) => r.id === "def_2")?.assignedCount).toBe(0);
  });

  it("orders active definitions before archived, then by title", async () => {
    const { ctx } = makeCtx({
      defs: [
        { id: "def_z", title: "Zzz habit", archivedAt: null },
        { id: "def_old", title: "Aaa archived", archivedAt: new Date() },
        { id: "def_a", title: "Aaa habit", archivedAt: null },
      ],
    });

    const result = await listCoachHabitDefinitions(ctx);

    expect(result.map((r) => r.id)).toEqual(["def_a", "def_z", "def_old"]);
  });
});
