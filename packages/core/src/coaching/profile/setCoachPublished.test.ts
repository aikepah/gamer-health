import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import type { CoachProfileRow } from "./getOrCreateCoachProfile";
import { setCoachPublished } from "./setCoachPublished";

interface AuthzProfile {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

function makeCoachProfileRow(
  overrides: Partial<CoachProfileRow> = {},
): CoachProfileRow {
  return {
    userId: "coach_1",
    headline: "Sleep coach",
    bio: null,
    specialties: [],
    isPublished: false,
    acceptingApplications: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCtx(config: {
  authzProfile?: AuthzProfile;
  existingCoachProfile?: CoachProfileRow;
  timezone?: string | null;
  gamesCount?: number;
  availabilityCount?: number;
  updateReturning?: { isPublished: boolean }[];
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue(
      config.authzProfile
        ? { ...config.authzProfile, timezone: config.timezone ?? null }
        : undefined,
    );
  const coachProfileFindFirst = vi
    .fn()
    .mockResolvedValue(config.existingCoachProfile ?? makeCoachProfileRow());

  const countWhere = vi
    .fn()
    .mockResolvedValueOnce([{ value: config.gamesCount ?? 0 }])
    .mockResolvedValueOnce([{ value: config.availabilityCount ?? 0 }]);
  const select = vi.fn(() => ({
    from: vi.fn().mockReturnThis(),
    where: countWhere,
  }));

  const updateReturning = vi
    .fn()
    .mockResolvedValue(config.updateReturning ?? []);
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set: updateSet });

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachProfile: { findFirst: coachProfileFindFirst },
    },
    select,
    update,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "coach_1" } as ServiceCtx, updateSet, select };
}

describe("setCoachPublished", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach", async () => {
    const { ctx } = makeCtx({
      authzProfile: { role: "player", deactivatedAt: null },
    });
    await expect(
      setCoachPublished(ctx, { published: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(BAD_REQUEST) naming a missing timezone", async () => {
    const { ctx, select } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      timezone: null,
      gamesCount: 1,
      availabilityCount: 1,
    });
    await expect(
      setCoachPublished(ctx, { published: true }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("timezone") as string,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("throws CoreError(BAD_REQUEST) naming a missing headline", async () => {
    const { ctx } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      timezone: "America/Chicago",
      existingCoachProfile: makeCoachProfileRow({ headline: null }),
      gamesCount: 1,
      availabilityCount: 1,
    });
    await expect(
      setCoachPublished(ctx, { published: true }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("headline") as string,
    });
  });

  it("throws CoreError(BAD_REQUEST) naming zero games", async () => {
    const { ctx } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      timezone: "America/Chicago",
      gamesCount: 0,
      availabilityCount: 1,
    });
    await expect(
      setCoachPublished(ctx, { published: true }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("game") as string,
    });
  });

  it("throws CoreError(BAD_REQUEST) naming zero availability blocks", async () => {
    const { ctx } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      timezone: "America/Chicago",
      gamesCount: 1,
      availabilityCount: 0,
    });
    await expect(
      setCoachPublished(ctx, { published: true }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("availability") as string,
    });
  });

  it("publishes when every precondition is met", async () => {
    const { ctx, updateSet } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      timezone: "America/Chicago",
      gamesCount: 1,
      availabilityCount: 1,
      updateReturning: [{ isPublished: true }],
    });

    const result = await setCoachPublished(ctx, { published: true });

    expect(result).toEqual({ isPublished: true });
    expect(updateSet).toHaveBeenCalledWith({ isPublished: true });
  });

  it("always allows unpublishing, skipping every precondition", async () => {
    const { ctx, select, updateSet } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      timezone: null,
      existingCoachProfile: makeCoachProfileRow({ headline: null }),
      updateReturning: [{ isPublished: false }],
    });

    const result = await setCoachPublished(ctx, { published: false });

    expect(result).toEqual({ isPublished: false });
    expect(select).not.toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith({ isPublished: false });
  });
});
