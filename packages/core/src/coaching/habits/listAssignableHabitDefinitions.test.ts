import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { listAssignableHabitDefinitions } from "./listAssignableHabitDefinitions";

function makeCtx(config: {
  role?: "player" | "coach" | "admin";
  defs?: unknown[];
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue({ role: config.role ?? "coach", deactivatedAt: null });
  const defFindMany = vi.fn().mockResolvedValue(config.defs ?? []);

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      HabitDefinition: { findMany: defFindMany },
    },
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "coach_1" } as ServiceCtx, defFindMany };
}

describe("listAssignableHabitDefinitions", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach", async () => {
    const { ctx } = makeCtx({ role: "player" });
    await expect(listAssignableHabitDefinitions(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns whatever the scoped query resolves", async () => {
    const defs = [{ id: "def_1" }, { id: "def_2" }];
    const { ctx, defFindMany } = makeCtx({ defs });
    const result = await listAssignableHabitDefinitions(ctx);
    expect(result).toBe(defs);
    expect(defFindMany).toHaveBeenCalledTimes(1);
  });
});
