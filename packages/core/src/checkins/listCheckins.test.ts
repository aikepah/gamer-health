import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { CheckinRow } from "./dailyGuard";
import { listCheckins } from "./listCheckins";

function makeCheckinRow(overrides: Partial<CheckinRow> = {}): CheckinRow {
  return {
    id: "checkin_1",
    userId: "user_1",
    context: "daily",
    sessionId: null,
    mood: 3,
    energy: null,
    sleepQuality: null,
    note: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeCtx(options: {
  userId: string | null;
  items?: unknown[];
  total?: number;
}): { ctx: ServiceCtx; findMany: ReturnType<typeof vi.fn> } {
  const findMany = vi.fn().mockResolvedValue(options.items ?? []);
  const where = vi.fn().mockResolvedValue([{ value: options.total ?? 0 }]);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  const db = {
    query: { Checkin: { findMany } },
    select,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: options.userId }, findMany };
}

describe("listCheckins", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx, findMany } = makeCtx({ userId: null });
    await expect(
      listCheckins(ctx, { limit: 30, offset: 0 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns items and total from the query", async () => {
    const items = [
      makeCheckinRow({ id: "checkin_a" }),
      makeCheckinRow({ id: "checkin_b" }),
    ];
    const { ctx } = makeCtx({ userId: "user_1", items, total: 12 });
    const result = await listCheckins(ctx, { limit: 30, offset: 0 });
    expect(result).toEqual({ items, total: 12 });
  });

  it("passes limit/offset through to the query", async () => {
    const { ctx, findMany } = makeCtx({ userId: "user_1" });
    await listCheckins(ctx, { limit: 5, offset: 10 });
    const arg = findMany.mock.calls[0]?.[0] as {
      limit: number;
      offset: number;
    };
    expect(arg.limit).toBe(5);
    expect(arg.offset).toBe(10);
  });
});
