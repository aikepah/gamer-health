import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import { deleteSession } from "./deleteSession";

function makeCtx(options: {
  userId: string | null;
  deletedRows?: { id: string }[];
}): { ctx: ServiceCtx; del: ReturnType<typeof vi.fn> } {
  const returning = vi.fn().mockResolvedValue(options.deletedRows ?? []);
  const where = vi.fn().mockReturnValue({ returning });
  const del = vi.fn().mockReturnValue({ where });

  const db = { delete: del } as unknown as ServiceCtx["db"];
  return { ctx: { db, userId: options.userId }, del };
}

describe("deleteSession", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx({ userId: null });
    await expect(deleteSession(ctx, { id: "session_1" })).rejects.toMatchObject(
      { code: "UNAUTHORIZED" },
    );
  });

  it("throws CoreError(NOT_FOUND) when nothing matched (wrong owner or missing)", async () => {
    const { ctx } = makeCtx({ userId: "user_1", deletedRows: [] });
    await expect(deleteSession(ctx, { id: "session_1" })).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
  });

  it("returns { deleted: true } when a row is removed", async () => {
    const { ctx } = makeCtx({
      userId: "user_1",
      deletedRows: [{ id: "session_1" }],
    });
    await expect(deleteSession(ctx, { id: "session_1" })).resolves.toEqual({
      deleted: true,
    });
  });
});
