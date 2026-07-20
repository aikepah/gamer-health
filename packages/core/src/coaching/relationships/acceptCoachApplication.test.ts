import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { acceptCoachApplication } from "./acceptCoachApplication";

interface RelationshipRow {
  id: string;
  playerUserId: string;
  coachUserId: string;
  status: string;
}

/** A thenable that also exposes `.returning()` — mirrors drizzle's update builder. */
function chainable<T>(awaited: T, returningValue: unknown) {
  const p = Promise.resolve(awaited) as Promise<T> & {
    returning: ReturnType<typeof vi.fn>;
  };
  p.returning = vi.fn().mockResolvedValue(returningValue);
  return p;
}

function makeCtx(config: {
  callerId?: string;
  authzProfile?: {
    role: "player" | "coach" | "admin";
    deactivatedAt: Date | null;
  };
  row?: RelationshipRow | undefined;
  existingActive?: { id: string } | undefined;
  /** Rows returned by the conditional accept UPDATE; [] simulates losing the race. */
  acceptedRows?: RelationshipRow[];
  transactionThrows?: unknown;
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue(
      config.authzProfile ?? { role: "coach", deactivatedAt: null },
    );
  const outerFindFirst = vi.fn().mockResolvedValue(config.row);

  const txFindFirst = vi.fn().mockResolvedValue(config.existingActive);

  const acceptedRows =
    config.acceptedRows ??
    (config.row
      ? [{ ...config.row, status: "active" }]
      : [
          {
            id: "rel_1",
            playerUserId: "player_1",
            coachUserId: "coach_1",
            status: "active",
          },
        ]);

  let updateCallIndex = 0;
  const acceptWhere = vi.fn(() => chainable(undefined, acceptedRows));
  const acceptSet = vi.fn(
    (_patch: { status: string; respondedAt: Date; startedAt: Date }) => ({
      where: acceptWhere,
    }),
  );
  const declineWhere = vi.fn(() => chainable(undefined, []));
  const declineSet = vi.fn(
    (_patch: { status: string; respondedAt: Date; responseNote: string }) => ({
      where: declineWhere,
    }),
  );

  const update = vi.fn(() => {
    updateCallIndex++;
    return updateCallIndex === 1 ? { set: acceptSet } : { set: declineSet };
  });

  const tx = {
    query: { CoachingRelationship: { findFirst: txFindFirst } },
    update,
  };

  const transaction = config.transactionThrows
    ? vi.fn().mockRejectedValue(config.transactionThrows)
    : vi.fn((cb: (tx: unknown) => unknown) => cb(tx));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachingRelationship: { findFirst: outerFindFirst },
    },
    transaction,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "coach_1" } as ServiceCtx,
    acceptSet,
    acceptWhere,
    declineSet,
    declineWhere,
    txFindFirst,
  };
}

describe("acceptCoachApplication", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach", async () => {
    const { ctx } = makeCtx({
      authzProfile: { role: "player", deactivatedAt: null },
    });
    await expect(
      acceptCoachApplication(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(NOT_FOUND) when the row doesn't exist", async () => {
    const { ctx } = makeCtx({ row: undefined });
    await expect(
      acceptCoachApplication(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(NOT_FOUND) when the row belongs to a different coach", async () => {
    const { ctx } = makeCtx({
      callerId: "coach_1",
      row: {
        id: "rel_1",
        playerUserId: "player_1",
        coachUserId: "someone_else",
        status: "applied",
      },
    });
    await expect(
      acceptCoachApplication(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(CONFLICT) when the row isn't currently 'applied'", async () => {
    const { ctx } = makeCtx({
      row: {
        id: "rel_1",
        playerUserId: "player_1",
        coachUserId: "coach_1",
        status: "declined",
      },
    });
    await expect(
      acceptCoachApplication(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This application has already been handled",
    });
  });

  it("throws CoreError(CONFLICT) when the player already has another active coach", async () => {
    const { ctx } = makeCtx({
      row: {
        id: "rel_1",
        playerUserId: "player_1",
        coachUserId: "coach_1",
        status: "applied",
      },
      existingActive: { id: "rel_other" },
    });
    await expect(
      acceptCoachApplication(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This player already has a coach",
    });
  });

  it("throws CONFLICT when the conditional accept update matches nothing (lost race)", async () => {
    const { ctx } = makeCtx({
      row: {
        id: "rel_1",
        playerUserId: "player_1",
        coachUserId: "coach_1",
        status: "applied",
      },
      acceptedRows: [],
    });
    await expect(
      acceptCoachApplication(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This application has already been handled",
    });
  });

  it("maps a unique-violation from the one-active-per-player index to CONFLICT", async () => {
    class FakePgError extends Error {
      code = "23505";
    }
    const { ctx } = makeCtx({
      row: {
        id: "rel_1",
        playerUserId: "player_1",
        coachUserId: "coach_1",
        status: "applied",
      },
      transactionThrows: new FakePgError("unique violation"),
    });
    await expect(
      acceptCoachApplication(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This player already has a coach",
    });
  });

  it("accepts the row and auto-declines the player's other applied rows", async () => {
    const { ctx, acceptSet, declineSet, declineWhere } = makeCtx({
      row: {
        id: "rel_1",
        playerUserId: "player_1",
        coachUserId: "coach_1",
        status: "applied",
      },
    });

    const result = await acceptCoachApplication(ctx, {
      relationshipId: "rel_1",
    });

    expect(result.status).toBe("active");
    expect(acceptSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" }),
    );
    const acceptArg = acceptSet.mock.calls[0]?.[0] as {
      respondedAt: Date;
      startedAt: Date;
    };
    expect(acceptArg.respondedAt).toBeInstanceOf(Date);
    expect(acceptArg.startedAt).toBeInstanceOf(Date);

    expect(declineSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "declined",
        responseNote: "Player started coaching with another coach",
      }),
    );
    expect(declineWhere).toHaveBeenCalled();
  });
});
