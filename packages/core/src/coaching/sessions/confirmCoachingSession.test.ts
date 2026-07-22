import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { confirmCoachingSession } from "./confirmCoachingSession";

interface SessionRow {
  id: string;
  coachUserId: string;
  playerUserId: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
}

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);
const FUTURE_END = new Date(FUTURE.getTime() + 60 * 60 * 1000);

const ROW: SessionRow = {
  id: "session_1",
  coachUserId: "coach_1",
  playerUserId: "player_1",
  status: "proposed",
  startsAt: FUTURE,
  endsAt: FUTURE_END,
};

function makeCtx(config: {
  callerId?: string;
  authzProfile?: { role: "player" | "coach" | "admin"; deactivatedAt: Date | null };
  row?: SessionRow | undefined;
  overlapping?: { id: string } | undefined;
  /** Rows returned by the conditional confirm UPDATE; [] simulates losing the race. */
  confirmedRows?: SessionRow[];
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue(config.authzProfile ?? { role: "coach", deactivatedAt: null });
  const outerFindFirst = vi
    .fn()
    .mockResolvedValue("row" in config ? config.row : ROW);

  const txFindFirst = vi.fn().mockResolvedValue(config.overlapping);

  const confirmedRows =
    config.confirmedRows ?? [{ ...ROW, status: "confirmed" }];

  let updateCallIndex = 0;
  const confirmWhere = vi.fn(() => ({
    returning: vi.fn().mockResolvedValue(confirmedRows),
  }));
  const confirmSet = vi.fn(() => ({ where: confirmWhere }));
  const cancelWhere = vi.fn(() => Promise.resolve(undefined));
  const cancelSet = vi.fn(() => ({ where: cancelWhere }));

  const update = vi.fn(() => {
    updateCallIndex++;
    return updateCallIndex === 1 ? { set: confirmSet } : { set: cancelSet };
  });

  const tx = {
    query: { CoachingSession: { findFirst: txFindFirst } },
    update,
  };
  const transaction = vi.fn((cb: (tx: unknown) => unknown) => cb(tx));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachingSession: { findFirst: outerFindFirst },
    },
    transaction,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "coach_1" } as ServiceCtx,
    confirmSet,
    cancelSet,
    cancelWhere,
  };
}

describe("confirmCoachingSession", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach", async () => {
    const { ctx } = makeCtx({ authzProfile: { role: "player", deactivatedAt: null } });
    await expect(
      confirmCoachingSession(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND when the row doesn't exist", async () => {
    const { ctx } = makeCtx({ row: undefined });
    await expect(
      confirmCoachingSession(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND when the row belongs to a different coach", async () => {
    const { ctx } = makeCtx({ row: { ...ROW, coachUserId: "someone_else" } });
    await expect(
      confirmCoachingSession(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT when the row isn't 'proposed'", async () => {
    const { ctx } = makeCtx({ row: { ...ROW, status: "confirmed" } });
    await expect(
      confirmCoachingSession(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This session is no longer pending",
    });
  });

  it("throws CONFLICT when the slot has already passed", async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const { ctx } = makeCtx({
      row: { ...ROW, startsAt: past, endsAt: new Date(past.getTime() + 1000) },
    });
    await expect(
      confirmCoachingSession(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "That slot has already passed",
    });
  });

  it("throws CONFLICT when the coach has another overlapping confirmed session", async () => {
    const { ctx } = makeCtx({ overlapping: { id: "other_session" } });
    await expect(
      confirmCoachingSession(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Your coach is already booked then",
    });
  });

  it("throws CONFLICT when the conditional confirm update matches nothing (lost race)", async () => {
    const { ctx } = makeCtx({ confirmedRows: [] });
    await expect(
      confirmCoachingSession(ctx, { sessionId: "session_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This session is no longer pending",
    });
  });

  it("confirms the session and auto-cancels the coach's other overlapping proposals", async () => {
    const { ctx, confirmSet, cancelSet, cancelWhere } = makeCtx({});

    const result = await confirmCoachingSession(ctx, { sessionId: "session_1" });

    expect(result.status).toBe("confirmed");
    expect(confirmSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "confirmed" }),
    );
    expect(cancelSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        cancelledByUserId: "coach_1",
        cancelReason: "Coach confirmed another session in this slot",
      }),
    );
    expect(cancelWhere).toHaveBeenCalled();
  });
});
