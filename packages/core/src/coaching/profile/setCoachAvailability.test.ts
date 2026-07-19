import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import type { CoachProfileRow } from "./getOrCreateCoachProfile";
import { setCoachAvailability } from "./setCoachAvailability";

interface AuthzProfile {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

function makeCoachProfileRow(): CoachProfileRow {
  return {
    userId: "coach_1",
    headline: "Sleep coach",
    bio: null,
    specialties: [],
    isPublished: false,
    acceptingApplications: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeCtx(config: {
  authzProfile?: AuthzProfile;
  finalRows?: {
    id: string;
    weekday: number;
    startMinute: number;
    endMinute: number;
  }[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(config.authzProfile);
  const coachProfileFindFirst = vi
    .fn()
    .mockResolvedValue(makeCoachProfileRow());

  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const availabilityFindMany = vi
    .fn()
    .mockResolvedValue(config.finalRows ?? []);

  const tx = {
    query: { CoachAvailability: { findMany: availabilityFindMany } },
    delete: vi.fn(() => ({ where: deleteWhere })),
    insert: vi.fn(() => ({ values: insertValues })),
  };

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachProfile: { findFirst: coachProfileFindFirst },
    },
    transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: "coach_1" } as ServiceCtx,
    deleteWhere,
    insertValues,
  };
}

describe("setCoachAvailability", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach", async () => {
    const { ctx } = makeCtx({
      authzProfile: { role: "player", deactivatedAt: null },
    });
    await expect(
      setCoachAvailability(ctx, { blocks: [] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(BAD_REQUEST) when a block doesn't end after it starts", async () => {
    const { ctx, deleteWhere } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
    });
    await expect(
      setCoachAvailability(ctx, {
        blocks: [{ weekday: 1, startMinute: 600, endMinute: 600 }],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("end after it starts") as string,
    });
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it("throws CoreError(BAD_REQUEST) when two blocks on the same weekday overlap", async () => {
    const { ctx, deleteWhere } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
    });
    await expect(
      setCoachAvailability(ctx, {
        blocks: [
          { weekday: 1, startMinute: 600, endMinute: 700 },
          { weekday: 1, startMinute: 650, endMinute: 750 },
        ],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("overlap") as string,
    });
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it("rejects exact duplicate blocks as an overlap", async () => {
    const { ctx } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
    });
    await expect(
      setCoachAvailability(ctx, {
        blocks: [
          { weekday: 1, startMinute: 600, endMinute: 700 },
          { weekday: 1, startMinute: 600, endMinute: 700 },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("allows non-overlapping blocks across different weekdays", async () => {
    const { ctx, deleteWhere, insertValues } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      finalRows: [
        { id: "a1", weekday: 1, startMinute: 1020, endMinute: 1200 },
        { id: "a2", weekday: 6, startMinute: 600, endMinute: 840 },
      ],
    });

    const result = await setCoachAvailability(ctx, {
      blocks: [
        { weekday: 1, startMinute: 1020, endMinute: 1200 },
        { weekday: 6, startMinute: 600, endMinute: 840 },
      ],
    });

    expect(deleteWhere).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith([
      {
        coachUserId: "coach_1",
        weekday: 1,
        startMinute: 1020,
        endMinute: 1200,
      },
      { coachUserId: "coach_1", weekday: 6, startMinute: 600, endMinute: 840 },
    ]);
    expect(result).toHaveLength(2);
  });

  it("replaces with an empty set without inserting", async () => {
    const { ctx, deleteWhere, insertValues } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      finalRows: [],
    });

    const result = await setCoachAvailability(ctx, { blocks: [] });

    expect(deleteWhere).toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
