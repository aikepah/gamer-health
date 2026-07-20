import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { declineCoachApplication } from "./declineCoachApplication";

function makeCtx(config: {
  callerId?: string;
  authzProfile?: {
    role: "player" | "coach" | "admin";
    deactivatedAt: Date | null;
  };
  row?: { coachUserId: string; status: string } | undefined;
  /** Rows affected by the conditional UPDATE; [] simulates losing the race. */
  updatedRows?: { id: string }[];
}) {
  const findFirst = vi.fn().mockResolvedValue(config.row);
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue(
      config.authzProfile ?? { role: "coach", deactivatedAt: null },
    );
  const returning = vi
    .fn()
    .mockResolvedValue(config.updatedRows ?? [{ id: "rel_1" }]);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(
    (_patch: {
      status: string;
      respondedAt: Date;
      responseNote: string | null;
    }) => ({
      where,
    }),
  );
  const update = vi.fn(() => ({ set }));

  const db = {
    query: {
      CoachingRelationship: { findFirst },
      Profile: { findFirst: profileFindFirst },
    },
    update,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "coach_1" } as ServiceCtx,
    set,
    where,
  };
}

describe("declineCoachApplication", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach", async () => {
    const { ctx } = makeCtx({
      authzProfile: { role: "player", deactivatedAt: null },
    });
    await expect(
      declineCoachApplication(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(NOT_FOUND) when the row doesn't exist", async () => {
    const { ctx } = makeCtx({ row: undefined });
    await expect(
      declineCoachApplication(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(NOT_FOUND) when the row belongs to a different coach", async () => {
    const { ctx } = makeCtx({
      row: { coachUserId: "someone_else", status: "applied" },
    });
    await expect(
      declineCoachApplication(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(CONFLICT) when the row isn't currently 'applied'", async () => {
    const { ctx } = makeCtx({
      row: { coachUserId: "coach_1", status: "active" },
    });
    await expect(
      declineCoachApplication(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This application has already been handled",
    });
  });

  it("sets status to declined with the reason and stamps respondedAt", async () => {
    const { ctx, set } = makeCtx({
      row: { coachUserId: "coach_1", status: "applied" },
    });

    await declineCoachApplication(ctx, {
      relationshipId: "rel_1",
      reason: "Not a good fit right now",
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "declined",
        responseNote: "Not a good fit right now",
      }),
    );
    const arg = set.mock.calls[0]?.[0] as { respondedAt: Date };
    expect(arg.respondedAt).toBeInstanceOf(Date);
  });

  it("sets responseNote to null when no reason is given", async () => {
    const { ctx, set } = makeCtx({
      row: { coachUserId: "coach_1", status: "applied" },
    });

    await declineCoachApplication(ctx, { relationshipId: "rel_1" });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ responseNote: null }),
    );
  });

  it("throws CONFLICT when the conditional update matches nothing (lost race)", async () => {
    const { ctx } = makeCtx({
      row: { coachUserId: "coach_1", status: "applied" },
      updatedRows: [],
    });

    await expect(
      declineCoachApplication(ctx, { relationshipId: "rel_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This application has already been handled",
    });
  });
});
