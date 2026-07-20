import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { endCoachingRelationship } from "./endCoachingRelationship";

function makeCtx(config: {
  callerId?: string;
  row?:
    | { playerUserId: string; coachUserId: string; status: string }
    | undefined;
  /** Rows affected by the conditional UPDATE; [] simulates losing the race. */
  updatedRows?: { id: string }[];
}) {
  const findFirst = vi.fn().mockResolvedValue(config.row);
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue({ role: "player", deactivatedAt: null });
  const returning = vi
    .fn()
    .mockResolvedValue(config.updatedRows ?? [{ id: "rel_1" }]);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(
    (_patch: {
      status: string;
      endedAt: Date;
      endedByUserId: string;
      endReason: string | null;
    }) => ({ where }),
  );
  const update = vi.fn(() => ({ set }));

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
    set,
    where,
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
});
