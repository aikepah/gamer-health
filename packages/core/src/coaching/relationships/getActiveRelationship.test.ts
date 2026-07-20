import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import {
  findActiveRelationship,
  requireMyCoachRelationship,
} from "./getActiveRelationship";

function makeCtx(config: {
  callerId?: string;
  row?: { id: string } | undefined;
}) {
  const findFirst = vi.fn().mockResolvedValue(config.row);
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue({ role: "player", deactivatedAt: null });
  const db = {
    query: {
      CoachingRelationship: { findFirst },
      Profile: { findFirst: profileFindFirst },
    },
  } as unknown as ServiceCtx["db"];
  return { ctx: { db, userId: config.callerId ?? "player_1" } as ServiceCtx };
}

describe("findActiveRelationship", () => {
  it("returns the row when an active relationship exists", async () => {
    const { ctx } = makeCtx({ row: { id: "rel_1" } });
    const result = await findActiveRelationship(ctx, "player_1", "coach_1");
    expect(result).toEqual({ id: "rel_1" });
  });

  it("returns null when there's no active relationship", async () => {
    const { ctx } = makeCtx({ row: undefined });
    const result = await findActiveRelationship(ctx, "player_1", "coach_1");
    expect(result).toBeNull();
  });
});

describe("requireMyCoachRelationship", () => {
  it("throws CoreError(FORBIDDEN) when the caller has no active coach", async () => {
    const { ctx } = makeCtx({ row: undefined });
    await expect(requireMyCoachRelationship(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You don't have a coach",
    });
  });

  it("returns the caller's active relationship row", async () => {
    const { ctx } = makeCtx({ row: { id: "rel_1" } });
    const result = await requireMyCoachRelationship(ctx);
    expect(result).toEqual({ id: "rel_1" });
  });
});
