import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { applyToCoach } from "./applyToCoach";

interface ProfileLite {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

interface CoachProfileLite {
  isPublished: boolean;
  acceptingApplications: boolean;
}

function makeCtx(config: {
  callerId?: string;
  callerProfile?: ProfileLite;
  targetProfile?: ProfileLite;
  coachProfile?: CoachProfileLite;
  existingActive?: unknown;
  existingOpenWithCoach?: unknown;
  insertedId?: string;
  insertError?: unknown;
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValueOnce(config.callerProfile)
    .mockResolvedValueOnce(config.targetProfile);
  const coachProfileFindFirst = vi.fn().mockResolvedValue(config.coachProfile);
  const relationshipFindFirst = vi
    .fn()
    .mockResolvedValueOnce(config.existingActive)
    .mockResolvedValueOnce(config.existingOpenWithCoach);

  const returning = config.insertError
    ? vi.fn().mockRejectedValue(config.insertError)
    : vi
        .fn()
        .mockResolvedValue(
          config.insertedId ? [{ id: config.insertedId }] : [],
        );
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachProfile: { findFirst: coachProfileFindFirst },
      CoachingRelationship: { findFirst: relationshipFindFirst },
    },
    insert,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "player_1" } as ServiceCtx,
    insert,
    values,
    returning,
  };
}

describe("applyToCoach", () => {
  it("throws CoreError(BAD_REQUEST) when applying to yourself", async () => {
    const { ctx } = makeCtx({ callerId: "coach_1" });
    await expect(
      applyToCoach(ctx, { coachUserId: "coach_1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws CoreError(NOT_FOUND) when the coach profile doesn't exist", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      targetProfile: { role: "coach", deactivatedAt: null },
      coachProfile: undefined,
    });
    await expect(
      applyToCoach(ctx, { coachUserId: "coach_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(NOT_FOUND) when the coach is unpublished", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      targetProfile: { role: "coach", deactivatedAt: null },
      coachProfile: { isPublished: false, acceptingApplications: true },
    });
    await expect(
      applyToCoach(ctx, { coachUserId: "coach_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(NOT_FOUND) when the target's role is no longer coach", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      targetProfile: { role: "player", deactivatedAt: null },
      coachProfile: { isPublished: true, acceptingApplications: true },
    });
    await expect(
      applyToCoach(ctx, { coachUserId: "coach_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(CONFLICT) when the coach isn't accepting new players", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      targetProfile: { role: "coach", deactivatedAt: null },
      coachProfile: { isPublished: true, acceptingApplications: false },
    });
    await expect(
      applyToCoach(ctx, { coachUserId: "coach_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This coach isn't accepting new players",
    });
  });

  it("throws CoreError(CONFLICT) when the caller already has an active coach", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      targetProfile: { role: "coach", deactivatedAt: null },
      coachProfile: { isPublished: true, acceptingApplications: true },
      existingActive: { id: "rel_active" },
    });
    await expect(
      applyToCoach(ctx, { coachUserId: "coach_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "You already have a coach — end that relationship first",
    });
  });

  it("throws CoreError(CONFLICT) when the caller already has an open row with this coach", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      targetProfile: { role: "coach", deactivatedAt: null },
      coachProfile: { isPublished: true, acceptingApplications: true },
      existingActive: undefined,
      existingOpenWithCoach: { id: "rel_open" },
    });
    await expect(
      applyToCoach(ctx, { coachUserId: "coach_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "You've already applied to this coach",
    });
  });

  it("inserts an applied relationship and returns its id", async () => {
    const { ctx, values } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      targetProfile: { role: "coach", deactivatedAt: null },
      coachProfile: { isPublished: true, acceptingApplications: true },
      insertedId: "rel_new",
    });

    const result = await applyToCoach(ctx, {
      coachUserId: "coach_1",
      message: "Hi!",
    });

    expect(result).toEqual({ relationshipId: "rel_new" });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        playerUserId: "player_1",
        coachUserId: "coach_1",
        status: "applied",
        initiatedByUserId: "player_1",
        message: "Hi!",
      }),
    );
  });

  it("maps a unique-violation race on insert to CoreError(CONFLICT)", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      targetProfile: { role: "coach", deactivatedAt: null },
      coachProfile: { isPublished: true, acceptingApplications: true },
      insertError: Object.assign(new Error("duplicate"), { code: "23505" }),
    });

    await expect(
      applyToCoach(ctx, { coachUserId: "coach_1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "You've already applied to this coach",
    });
  });
});
