import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import type { CoachProfileRow } from "./getOrCreateCoachProfile";
import { setCoachAcceptingApplications } from "./setCoachAcceptingApplications";

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
    isPublished: true,
    acceptingApplications: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeCtx(config: {
  authzProfile?: AuthzProfile;
  updateReturning?: { acceptingApplications: boolean }[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(config.authzProfile);
  const coachProfileFindFirst = vi
    .fn()
    .mockResolvedValue(makeCoachProfileRow());

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
    update,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "coach_1" } as ServiceCtx, updateSet };
}

describe("setCoachAcceptingApplications", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach", async () => {
    const { ctx } = makeCtx({
      authzProfile: { role: "player", deactivatedAt: null },
    });
    await expect(
      setCoachAcceptingApplications(ctx, { accepting: false }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("flips acceptingApplications with no preconditions", async () => {
    const { ctx, updateSet } = makeCtx({
      authzProfile: { role: "coach", deactivatedAt: null },
      updateReturning: [{ acceptingApplications: false }],
    });

    const result = await setCoachAcceptingApplications(ctx, {
      accepting: false,
    });

    expect(result).toEqual({ acceptingApplications: false });
    expect(updateSet).toHaveBeenCalledWith({ acceptingApplications: false });
  });
});
