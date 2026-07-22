import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { cancelCoachingSession } from "./cancelCoachingSession";

interface SessionRow {
  id: string;
  coachUserId: string;
  playerUserId: string;
  status: string;
}

const ROW: SessionRow = {
  id: "session_1",
  coachUserId: "coach_1",
  playerUserId: "player_1",
  status: "proposed",
};

function makeCtx(config: {
  callerId?: string;
  row?: SessionRow | undefined;
  /** Rows affected by the conditional cancel UPDATE; [] simulates losing the race. */
  updatedRows?: { id: string }[];
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue({ role: "player", deactivatedAt: null });
  const findFirst = vi.fn().mockResolvedValue("row" in config ? config.row : ROW);

  const returning = vi
    .fn()
    .mockResolvedValue(config.updatedRows ?? [{ id: ROW.id }]);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachingSession: { findFirst },
    },
    update,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "player_1" } as ServiceCtx,
    set,
  };
}

describe("cancelCoachingSession", () => {
  it("throws NOT_FOUND when the row doesn't exist", async () => {
    const { ctx } = makeCtx({ row: undefined });
    await expect(
      cancelCoachingSession(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND when the caller is neither the player nor the coach", async () => {
    const { ctx } = makeCtx({ callerId: "someone_else" });
    await expect(
      cancelCoachingSession(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT when the session is already completed", async () => {
    const { ctx } = makeCtx({ row: { ...ROW, status: "completed" } });
    await expect(
      cancelCoachingSession(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This session can no longer be cancelled",
    });
  });

  it("throws CONFLICT when the conditional update matches nothing (lost race)", async () => {
    const { ctx } = makeCtx({ updatedRows: [] });
    await expect(
      cancelCoachingSession(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows the player to cancel a proposed session with a reason", async () => {
    const { ctx, set } = makeCtx({ callerId: "player_1" });
    await cancelCoachingSession(ctx, {
      sessionId: "session_1",
      reason: "Can't make it",
    });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        cancelledByUserId: "player_1",
        cancelReason: "Can't make it",
      }),
    );
  });

  it("allows the coach to cancel/decline a proposed session (no separate 'declined' status)", async () => {
    const { ctx, set } = makeCtx({ callerId: "coach_1" });
    await cancelCoachingSession(ctx, { sessionId: "session_1" });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        cancelledByUserId: "coach_1",
        cancelReason: null,
      }),
    );
  });

  it("allows cancelling a confirmed session", async () => {
    const { ctx, set } = makeCtx({ row: { ...ROW, status: "confirmed" } });
    await cancelCoachingSession(ctx, { sessionId: "session_1" });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled" }),
    );
  });
});
