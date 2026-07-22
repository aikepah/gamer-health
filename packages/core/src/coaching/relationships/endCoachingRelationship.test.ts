import { describe, expect, it, vi } from "vitest";

import { CoachingRelationship, CoachingSession } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { endCoachingRelationship } from "./endCoachingRelationship";

function makeCtx(config: {
  callerId?: string;
  row?:
    | { playerUserId: string; coachUserId: string; status: string }
    | undefined;
  /** Rows affected by the conditional relationship UPDATE; [] simulates losing the race. */
  updatedRows?: { id: string }[];
}) {
  const findFirst = vi.fn().mockResolvedValue(config.row);
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue({ role: "player", deactivatedAt: null });

  const relationshipReturning = vi
    .fn()
    .mockResolvedValue(config.updatedRows ?? [{ id: "rel_1" }]);
  const relationshipWhere = vi.fn(() => ({ returning: relationshipReturning }));
  const relationshipSet = vi.fn(
    (_patch: {
      status: string;
      endedAt: Date;
      endedByUserId: string;
      endReason: string | null;
    }) => ({ where: relationshipWhere }),
  );

  // The #15 session-cancel UPDATE doesn't chain `.returning()` — `where(...)`
  // is awaited directly, so it just needs to be a thenable-compatible value.
  const sessionWhere = vi.fn(() => Promise.resolve(undefined));
  const sessionSet = vi.fn(
    (_patch: {
      status: string;
      cancelledAt: Date;
      cancelledByUserId: string;
      cancelReason: string;
    }) => ({ where: sessionWhere }),
  );

  const update = vi.fn((table: unknown) =>
    table === CoachingSession ? { set: sessionSet } : { set: relationshipSet },
  );

  const tx = { update };
  const transaction = vi.fn((cb: (tx: unknown) => unknown) => cb(tx));

  const db = {
    query: {
      CoachingRelationship: { findFirst },
      Profile: { findFirst: profileFindFirst },
    },
    transaction,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "player_1" } as ServiceCtx,
    set: relationshipSet,
    where: relationshipWhere,
    sessionSet,
    sessionWhere,
    update,
  };
}

describe("endCoachingRelationship", () => {
  it("throws CoreError(NOT_FOUND) when the row doesn't exist", async () => {
    const { ctx } = makeCtx({ row: undefined });
    await expect(
      endCoachingRelationship(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(NOT_FOUND) when the caller is neither the player nor the coach", async () => {
    const { ctx } = makeCtx({
      callerId: "someone_else",
      row: {
        playerUserId: "player_1",
        coachUserId: "coach_1",
        status: "active",
      },
    });
    await expect(
      endCoachingRelationship(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(CONFLICT) when the row isn't currently 'active'", async () => {
    const { ctx } = makeCtx({
      callerId: "player_1",
      row: {
        playerUserId: "player_1",
        coachUserId: "coach_1",
        status: "applied",
      },
    });
    await expect(
      endCoachingRelationship(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This coaching relationship is no longer active",
    });
  });

  it("allows the player to end the relationship", async () => {
    const { ctx, set } = makeCtx({
      callerId: "player_1",
      row: {
        playerUserId: "player_1",
        coachUserId: "coach_1",
        status: "active",
      },
    });

    await endCoachingRelationship(ctx, {
      relationshipId: "rel_1",
      reason: "Moving on",
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ended",
        endedByUserId: "player_1",
        endReason: "Moving on",
      }),
    );
    const arg = set.mock.calls[0]?.[0] as { endedAt: Date };
    expect(arg.endedAt).toBeInstanceOf(Date);
  });

  it("allows the coach to end the relationship", async () => {
    const { ctx, set } = makeCtx({
      callerId: "coach_1",
      row: {
        playerUserId: "player_1",
        coachUserId: "coach_1",
        status: "active",
      },
    });

    await endCoachingRelationship(ctx, { relationshipId: "rel_1" });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ended",
        endedByUserId: "coach_1",
        endReason: null,
      }),
    );
  });

  it("throws CONFLICT when the conditional update matches nothing (lost race)", async () => {
    const { ctx } = makeCtx({
      callerId: "player_1",
      row: {
        playerUserId: "player_1",
        coachUserId: "coach_1",
        status: "active",
      },
      updatedRows: [],
    });

    await expect(
      endCoachingRelationship(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This coaching relationship is no longer active",
    });
  });

  it("does NOT cancel sessions when the conditional update loses the race", async () => {
    const { ctx, sessionSet } = makeCtx({
      callerId: "player_1",
      row: { playerUserId: "player_1", coachUserId: "coach_1", status: "active" },
      updatedRows: [],
    });

    await expect(
      endCoachingRelationship(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(sessionSet).not.toHaveBeenCalled();
  });

  it("cancels this relationship's future proposed/confirmed sessions in the same transaction (#15)", async () => {
    const { ctx, update, sessionSet, sessionWhere } = makeCtx({
      callerId: "coach_1",
      row: { playerUserId: "player_1", coachUserId: "coach_1", status: "active" },
    });

    await endCoachingRelationship(ctx, {
      relationshipId: "rel_1",
      reason: "Not a fit",
    });

    expect(update).toHaveBeenCalledWith(CoachingRelationship);
    expect(update).toHaveBeenCalledWith(CoachingSession);
    expect(sessionSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        cancelledByUserId: "coach_1",
        cancelReason: "Coaching relationship ended",
      }),
    );
    const arg = sessionSet.mock.calls[0]?.[0] as { cancelledAt: Date };
    expect(arg.cancelledAt).toBeInstanceOf(Date);
    expect(sessionWhere).toHaveBeenCalled();
  });
});
