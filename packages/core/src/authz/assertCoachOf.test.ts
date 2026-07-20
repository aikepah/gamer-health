import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import { assertCoachOf } from "./assertCoachOf";

function makeCtx(
  userId: string | null,
  profile:
    | { role: "player" | "coach" | "admin"; deactivatedAt: Date | null }
    | undefined,
  relationship: { id: string } | undefined = undefined,
): ServiceCtx {
  const findFirstProfile = vi.fn().mockResolvedValue(profile);
  const findFirstRelationship = vi.fn().mockResolvedValue(relationship);
  const db = {
    query: {
      Profile: { findFirst: findFirstProfile },
      CoachingRelationship: { findFirst: findFirstRelationship },
    },
  } as unknown as ServiceCtx["db"];
  return { db, userId };
}

describe("assertCoachOf", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const ctx = makeCtx(null, undefined);
    await expect(assertCoachOf(ctx, "player_1")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("throws CoreError(FORBIDDEN) for a non-coach role (no implicit admin pass)", async () => {
    const ctx = makeCtx("user_1", { role: "admin", deactivatedAt: null });
    await expect(assertCoachOf(ctx, "player_1")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws CoreError(FORBIDDEN) for a coach with no relationship to the player", async () => {
    const ctx = makeCtx(
      "user_1",
      { role: "coach", deactivatedAt: null },
      undefined,
    );
    await expect(assertCoachOf(ctx, "player_1")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "No active coaching relationship",
    });
  });

  it("throws CoreError(FORBIDDEN) for a deactivated coach", async () => {
    const ctx = makeCtx("user_1", {
      role: "coach",
      deactivatedAt: new Date(),
    });
    await expect(assertCoachOf(ctx, "player_1")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Account deactivated",
    });
  });

  it("resolves for a coach with an ACTIVE relationship to the player", async () => {
    const ctx = makeCtx(
      "coach_1",
      { role: "coach", deactivatedAt: null },
      { id: "rel_1" },
    );
    await expect(assertCoachOf(ctx, "player_1")).resolves.toBeUndefined();
  });

  it("throws CoreError(FORBIDDEN) for a coach whose relationship with the player is only `applied` or `ended`", async () => {
    // The lookup itself is scoped to status = 'active', so an
    // applied/ended-only relationship never matches — the mock simply
    // returns undefined, same as "no relationship at all".
    const ctx = makeCtx(
      "coach_1",
      { role: "coach", deactivatedAt: null },
      undefined,
    );
    await expect(assertCoachOf(ctx, "player_1")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "No active coaching relationship",
    });
  });

  it("throws CoreError(FORBIDDEN) when coach A tries to assert on coach B's player", async () => {
    // Coach A has an active relationship, but not with THIS player — the
    // query is scoped by both coachUserId and playerUserId, so the mock
    // returning undefined models coach B's player not matching coach A's row.
    const ctx = makeCtx(
      "coach_a",
      { role: "coach", deactivatedAt: null },
      undefined,
    );
    await expect(assertCoachOf(ctx, "coach_b_player")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "No active coaching relationship",
    });
  });
});
