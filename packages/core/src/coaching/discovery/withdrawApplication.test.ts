import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { withdrawApplication } from "./withdrawApplication";

function makeCtx(config: {
  callerId?: string;
  row?: { playerUserId: string; status: string } | undefined;
}) {
  const findFirst = vi.fn().mockResolvedValue(config.row);
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue({ role: "player", deactivatedAt: null });
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn((_patch: { status: string; respondedAt: Date }) => ({
    where,
  }));
  const update = vi.fn(() => ({ set }));

  const db = {
    query: {
      CoachingRelationship: { findFirst },
      Profile: { findFirst: profileFindFirst },
    },
    update,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "player_1" } as ServiceCtx,
    set,
    where,
  };
}

describe("withdrawApplication", () => {
  it("throws CoreError(NOT_FOUND) when the row doesn't exist", async () => {
    const { ctx } = makeCtx({ row: undefined });
    await expect(
      withdrawApplication(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(NOT_FOUND) when the row belongs to a different player", async () => {
    const { ctx } = makeCtx({
      row: { playerUserId: "someone_else", status: "applied" },
    });
    await expect(
      withdrawApplication(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(CONFLICT) when the row isn't currently 'applied'", async () => {
    const { ctx } = makeCtx({
      row: { playerUserId: "player_1", status: "withdrawn" },
    });
    await expect(
      withdrawApplication(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This application can no longer be withdrawn",
    });
  });

  it("sets status to withdrawn and stamps respondedAt", async () => {
    const { ctx, set } = makeCtx({
      row: { playerUserId: "player_1", status: "applied" },
    });

    await withdrawApplication(ctx, { relationshipId: "rel_1" });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "withdrawn" }),
    );
    const arg = set.mock.calls[0]?.[0] as { respondedAt: Date };
    expect(arg.respondedAt).toBeInstanceOf(Date);
  });
});
