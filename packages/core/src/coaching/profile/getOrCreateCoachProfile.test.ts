import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import type { CoachProfileRow } from "./getOrCreateCoachProfile";
import { getOrCreateCoachProfile } from "./getOrCreateCoachProfile";

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
  timezone?: string | null;
  existingCoachProfile?: CoachProfileRow;
  insertReturning?: CoachProfileRow[];
  userRow?: { name: string };
  games?: { game: { id: string; name: string; platform: string | null } }[];
  availability?: {
    id: string;
    weekday: number;
    startMinute: number;
    endMinute: number;
  }[];
}) {
  // Same underlying user for both calls to Profile.findFirst: role/deactivatedAt
  // (authz) and timezone (identity) — merging both into one persistent mock.
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue(
      config.authzProfile
        ? { ...config.authzProfile, timezone: config.timezone ?? null }
        : undefined,
    );
  const coachProfileFindFirst = vi
    .fn()
    .mockResolvedValue(config.existingCoachProfile);
  const userFindFirst = vi.fn().mockResolvedValue(config.userRow);
  const coachGameFindMany = vi.fn().mockResolvedValue(config.games ?? []);
  const coachAvailabilityFindMany = vi
    .fn()
    .mockResolvedValue(config.availability ?? []);

  const returning = vi.fn().mockResolvedValue(config.insertReturning ?? []);
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  const insert = vi.fn().mockReturnValue({ values });

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachProfile: { findFirst: coachProfileFindFirst },
      user: { findFirst: userFindFirst },
      CoachGame: { findMany: coachGameFindMany },
      CoachAvailability: { findMany: coachAvailabilityFindMany },
    },
    insert,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "coach_1" } as ServiceCtx, insert };
}

describe("getOrCreateCoachProfile", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach", async () => {
    const { ctx } = makeCtx({
      authzProfile: { role: "player", deactivatedAt: null },
    });
    await expect(getOrCreateCoachProfile(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws CoreError(FORBIDDEN) for an admin (no implicit coach bypass)", async () => {
    const { ctx } = makeCtx({
      authzProfile: { role: "admin", deactivatedAt: null },
    });
    await expect(getOrCreateCoachProfile(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("creates a coach_profile row (specialties: []) the first time a coach opens it", async () => {
    const created = makeCoachProfileRow();
    const { ctx, insert } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      existingCoachProfile: undefined,
      insertReturning: [created],
      userRow: { name: "Demo Coach" },
    });

    const result = await getOrCreateCoachProfile(ctx);

    expect(insert).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      userId: "coach_1",
      name: "Demo Coach",
      headline: null,
      specialties: [],
      isPublished: false,
      timezone: null,
      games: [],
      availability: [],
    });
  });

  it("returns the existing profile with games and availability, sorted", async () => {
    const existing = makeCoachProfileRow({
      headline: "Sleep coach",
      specialties: ["Sleep"],
      isPublished: true,
    });
    const { ctx, insert } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      timezone: "America/Chicago",
      existingCoachProfile: existing,
      userRow: { name: "Demo Coach" },
      games: [
        { game: { id: "g2", name: "Zelda", platform: "Switch" } },
        { game: { id: "g1", name: "Elden Ring", platform: "PC" } },
      ],
      availability: [
        { id: "a1", weekday: 1, startMinute: 1020, endMinute: 1200 },
      ],
    });

    const result = await getOrCreateCoachProfile(ctx);

    expect(insert).not.toHaveBeenCalled();
    expect(result.games.map((g) => g.name)).toEqual(["Elden Ring", "Zelda"]);
    expect(result.timezone).toBe("America/Chicago");
    expect(result.availability).toEqual([
      { id: "a1", weekday: 1, startMinute: 1020, endMinute: 1200 },
    ]);
  });
});
