import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { markSessionCompleted } from "./markSessionCompleted";

interface SessionRow {
  id: string;
  coachUserId: string;
  status: string;
  startsAt: Date;
}

const PAST = new Date(Date.now() - 60 * 60 * 1000);
const FUTURE = new Date(Date.now() + 60 * 60 * 1000);

const ROW: SessionRow = {
  id: "session_1",
  coachUserId: "coach_1",
  status: "confirmed",
  startsAt: PAST,
};

function makeCtx(config: {
  callerId?: string;
  authzProfile?: { role: "player" | "coach" | "admin"; deactivatedAt: Date | null };
  row?: SessionRow | undefined;
  updatedRows?: { id: string }[];
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue(config.authzProfile ?? { role: "coach", deactivatedAt: null });
  const findFirst = vi.fn().mockResolvedValue("row" in config ? config.row : ROW);

  const returning = vi
    .fn()
    .mockResolvedValue(config.updatedRows ?? [{ id: ROW.id }]);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn((_patch: { status: string; completedAt: Date }) => ({
    where,
  }));
  const update = vi.fn(() => ({ set }));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachingSession: { findFirst },
    },
    update,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "coach_1" } as ServiceCtx,
    set,
  };
}

describe("markSessionCompleted", () => {
  it("throws FORBIDDEN for a non-coach", async () => {
    const { ctx } = makeCtx({ authzProfile: { role: "player", deactivatedAt: null } });
    await expect(
      markSessionCompleted(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND when the row belongs to a different coach", async () => {
    const { ctx } = makeCtx({ row: { ...ROW, coachUserId: "someone_else" } });
    await expect(
      markSessionCompleted(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT when the row isn't 'confirmed'", async () => {
    const { ctx } = makeCtx({ row: { ...ROW, status: "proposed" } });
    await expect(
      markSessionCompleted(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Only a confirmed session can be marked completed",
    });
  });

  it("throws CONFLICT when the session hasn't happened yet", async () => {
    const { ctx } = makeCtx({ row: { ...ROW, startsAt: FUTURE } });
    await expect(
      markSessionCompleted(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "That session hasn't happened yet",
    });
  });

  it("throws CONFLICT when the conditional update matches nothing (lost race)", async () => {
    const { ctx } = makeCtx({ updatedRows: [] });
    await expect(
      markSessionCompleted(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("marks a past confirmed session completed", async () => {
    const { ctx, set } = makeCtx({});
    await markSessionCompleted(ctx, { sessionId: "session_1" });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
    const arg = set.mock.calls[0]?.[0] as { completedAt: Date };
    expect(arg.completedAt).toBeInstanceOf(Date);
  });
});
