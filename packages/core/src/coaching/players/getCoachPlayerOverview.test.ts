import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { getCoachPlayerOverview } from "./getCoachPlayerOverview";

function makeCtx(config: {
  userId: string | null;
  profile?: { role: "player" | "coach" | "admin"; deactivatedAt: Date | null };
  relationship?: { id: string };
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(config.profile);
  const relationshipFindFirst = vi.fn().mockResolvedValue(config.relationship);
  const select = vi.fn(() => {
    throw new Error("db.select should not be called when assertCoachOf fails");
  });

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachingRelationship: { findFirst: relationshipFindFirst },
    },
    select,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: config.userId } as ServiceCtx, select };
}

describe("getCoachPlayerOverview", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach caller, before any other query", async () => {
    const { ctx, select } = makeCtx({
      userId: "admin_1",
      profile: { role: "admin", deactivatedAt: null },
    });

    await expect(
      getCoachPlayerOverview(ctx, { playerUserId: "player_1", days: 7 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(select).not.toHaveBeenCalled();
  });

  it("throws CoreError(FORBIDDEN) for a coach with no active relationship to the player", async () => {
    const { ctx, select } = makeCtx({
      userId: "coach_1",
      profile: { role: "coach", deactivatedAt: null },
      relationship: undefined,
    });

    await expect(
      getCoachPlayerOverview(ctx, { playerUserId: "player_1", days: 7 }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "No active coaching relationship",
    });
    expect(select).not.toHaveBeenCalled();
  });
});
