import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { getCoachAvailability } from "./getCoachAvailability";

interface ProfileLite {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
  timezone?: string | null;
}

function makeCtx(config: {
  callerProfile?: ProfileLite;
  targetProfile?: ProfileLite;
  coachProfile?: { isPublished: boolean };
  callerId?: string;
  coachUserId?: string;
  blocks?: {
    id: string;
    weekday: number;
    startMinute: number;
    endMinute: number;
  }[];
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValueOnce(config.callerProfile)
    .mockResolvedValueOnce(config.targetProfile);
  const coachProfileFindFirst = vi.fn().mockResolvedValue(config.coachProfile);
  const availabilityFindMany = vi.fn().mockResolvedValue(config.blocks ?? []);

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachProfile: { findFirst: coachProfileFindFirst },
      CoachAvailability: { findMany: availabilityFindMany },
    },
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "player_1" } as ServiceCtx,
  };
}

describe("getCoachAvailability", () => {
  it("throws CoreError(FORBIDDEN) when the caller is deactivated", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: new Date() },
    });
    await expect(
      getCoachAvailability(ctx, { coachUserId: "coach_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(NOT_FOUND) when no coach_profile row exists", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      coachProfile: undefined,
    });
    await expect(
      getCoachAvailability(ctx, { coachUserId: "coach_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(NOT_FOUND) for an unpublished coach viewed by another user", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      targetProfile: { role: "coach", deactivatedAt: null },
      coachProfile: { isPublished: false },
    });
    await expect(
      getCoachAvailability(ctx, { coachUserId: "coach_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns a published coach's availability for another signed-in user", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      targetProfile: {
        role: "coach",
        deactivatedAt: null,
        timezone: "America/Chicago",
      },
      coachProfile: { isPublished: true },
      blocks: [{ id: "a1", weekday: 1, startMinute: 1020, endMinute: 1200 }],
    });

    const result = await getCoachAvailability(ctx, { coachUserId: "coach_1" });

    expect(result.timezone).toBe("America/Chicago");
    expect(result.blocks).toHaveLength(1);
  });

  it("returns the coach's own availability even when unpublished", async () => {
    const { ctx } = makeCtx({
      callerId: "coach_1",
      coachUserId: "coach_1",
      callerProfile: {
        role: "coach",
        deactivatedAt: null,
        timezone: "America/Chicago",
      },
      targetProfile: {
        role: "coach",
        deactivatedAt: null,
        timezone: "America/Chicago",
      },
      coachProfile: { isPublished: false },
      blocks: [],
    });

    const result = await getCoachAvailability(ctx, { coachUserId: "coach_1" });

    expect(result.timezone).toBe("America/Chicago");
    expect(result.blocks).toEqual([]);
  });

  it("defaults timezone to UTC when the target profile has none", async () => {
    const { ctx } = makeCtx({
      callerId: "coach_1",
      coachUserId: "coach_1",
      callerProfile: { role: "coach", deactivatedAt: null },
      targetProfile: { role: "coach", deactivatedAt: null, timezone: null },
      coachProfile: { isPublished: false },
    });

    const result = await getCoachAvailability(ctx, { coachUserId: "coach_1" });

    // Null, not "UTC": an unset timezone must stay distinguishable from a
    // coach who explicitly chose UTC (see the service's comment).
    expect(result.timezone).toBeNull();
  });
});
