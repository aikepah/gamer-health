import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import type { CoachProfileRow } from "./getOrCreateCoachProfile";
import { updateCoachProfile } from "./updateCoachProfile";

interface AuthzProfile {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

function makeCoachProfileRow(
  overrides: Partial<CoachProfileRow> = {},
): CoachProfileRow {
  return {
    userId: "coach_1",
    headline: null,
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
  updateReturning?: CoachProfileRow[];
  userRow?: { name: string };
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue(
      config.authzProfile
        ? { ...config.authzProfile, timezone: "America/Chicago" }
        : undefined,
    );
  const coachProfileFindFirst = vi
    .fn()
    .mockResolvedValue(config.existingCoachProfile);
  const userFindFirst = vi.fn().mockResolvedValue(config.userRow);
  const coachGameFindMany = vi.fn().mockResolvedValue([]);
  const coachAvailabilityFindMany = vi.fn().mockResolvedValue([]);

  const insertReturning = vi
    .fn()
    .mockResolvedValue([config.existingCoachProfile ?? makeCoachProfileRow()]);
  const onConflictDoNothing = vi
    .fn()
    .mockReturnValue({ returning: insertReturning });
  const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing });
  const insert = vi.fn().mockReturnValue({ values: insertValues });

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
      user: { findFirst: userFindFirst },
      CoachGame: { findMany: coachGameFindMany },
      CoachAvailability: { findMany: coachAvailabilityFindMany },
    },
    insert,
    update,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "coach_1" } as ServiceCtx, updateSet };
}

describe("updateCoachProfile", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach", async () => {
    const { ctx } = makeCtx({
      authzProfile: { role: "player", deactivatedAt: null },
    });
    await expect(
      updateCoachProfile(ctx, { headline: "Hi", bio: null, specialties: [] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("updates headline/bio/specialties and returns the fresh detail", async () => {
    const existing = makeCoachProfileRow();
    const updated = makeCoachProfileRow({
      headline: "Sleep coach",
      bio: "I help gamers sleep better.",
      specialties: ["Sleep", "Focus & Attention"],
    });
    const { ctx, updateSet } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      existingCoachProfile: existing,
      updateReturning: [updated],
      userRow: { name: "Demo Coach" },
    });

    const result = await updateCoachProfile(ctx, {
      headline: "Sleep coach",
      bio: "I help gamers sleep better.",
      specialties: ["Sleep", "Focus & Attention"],
    });

    expect(updateSet).toHaveBeenCalledWith({
      headline: "Sleep coach",
      bio: "I help gamers sleep better.",
      specialties: ["Sleep", "Focus & Attention"],
    });
    expect(result).toMatchObject({
      headline: "Sleep coach",
      bio: "I help gamers sleep better.",
      specialties: ["Sleep", "Focus & Attention"],
    });
  });

  it("nulls headline/bio when omitted", async () => {
    const existing = makeCoachProfileRow({ headline: "Old", bio: "Old bio" });
    const updated = makeCoachProfileRow({ headline: null, bio: null });
    const { ctx, updateSet } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      existingCoachProfile: existing,
      updateReturning: [updated],
      userRow: { name: "Demo Coach" },
    });

    await updateCoachProfile(ctx, {
      headline: null,
      bio: null,
      specialties: [],
    });

    expect(updateSet).toHaveBeenCalledWith({
      headline: null,
      bio: null,
      specialties: [],
    });
  });
});
