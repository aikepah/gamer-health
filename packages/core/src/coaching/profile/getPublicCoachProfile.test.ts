import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import type { CoachProfileRow } from "./getOrCreateCoachProfile";
import { getPublicCoachProfile } from "./getPublicCoachProfile";

interface ProfileLite {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
  timezone?: string | null;
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
  callerId?: string;
  callerProfile?: ProfileLite;
  targetProfile?: ProfileLite;
  userRow?: { name: string };
  coachProfile?: CoachProfileRow;
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValueOnce(config.callerProfile)
    .mockResolvedValueOnce(config.targetProfile);
  const userFindFirst = vi.fn().mockResolvedValue(config.userRow);
  const coachProfileFindFirst = vi.fn().mockResolvedValue(config.coachProfile);
  const gameFindMany = vi.fn().mockResolvedValue([]);
  const availabilityFindMany = vi.fn().mockResolvedValue([]);

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      user: { findFirst: userFindFirst },
      CoachProfile: { findFirst: coachProfileFindFirst },
      CoachGame: { findMany: gameFindMany },
      CoachAvailability: { findMany: availabilityFindMany },
    },
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "player_1" } as ServiceCtx,
  };
}

describe("getPublicCoachProfile", () => {
  it("throws CoreError(FORBIDDEN) when the caller is deactivated", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: new Date() },
    });
    await expect(
      getPublicCoachProfile(ctx, { coachUserId: "coach_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(NOT_FOUND) for an unknown coach user id", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      userRow: undefined,
    });
    await expect(
      getPublicCoachProfile(ctx, { coachUserId: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(NOT_FOUND) for an unpublished coach viewed by another user", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      targetProfile: { role: "coach", deactivatedAt: null },
      userRow: { name: "Dana Whitfield" },
      coachProfile: makeCoachProfileRow({ isPublished: false }),
    });
    await expect(
      getPublicCoachProfile(ctx, { coachUserId: "coach_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(NOT_FOUND) when the target's role is no longer coach", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      targetProfile: { role: "player", deactivatedAt: null },
      userRow: { name: "Dana Whitfield" },
      coachProfile: makeCoachProfileRow({ isPublished: true }),
    });
    await expect(
      getPublicCoachProfile(ctx, { coachUserId: "coach_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns a published coach's profile to another signed-in user", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      targetProfile: {
        role: "coach",
        deactivatedAt: null,
        timezone: "America/Chicago",
      },
      userRow: { name: "Dana Whitfield" },
      coachProfile: makeCoachProfileRow({ isPublished: true }),
    });

    const result = await getPublicCoachProfile(ctx, { coachUserId: "coach_1" });

    expect(result).toMatchObject({
      name: "Dana Whitfield",
      headline: "Sleep coach",
      isPublished: true,
      timezone: "America/Chicago",
    });
  });

  it("lets the coach view their own unpublished profile", async () => {
    const { ctx } = makeCtx({
      callerId: "coach_1",
      callerProfile: { role: "coach", deactivatedAt: null },
      targetProfile: { role: "coach", deactivatedAt: null },
      userRow: { name: "Demo Coach" },
      coachProfile: makeCoachProfileRow({ isPublished: false }),
    });

    const result = await getPublicCoachProfile(ctx, { coachUserId: "coach_1" });

    expect(result.isPublished).toBe(false);
  });
});
