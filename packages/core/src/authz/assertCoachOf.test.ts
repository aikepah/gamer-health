import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import { assertCoachOf } from "./assertCoachOf";

function makeCtx(
  userId: string | null,
  profile:
    | { role: "player" | "coach" | "admin"; deactivatedAt: Date | null }
    | undefined,
): ServiceCtx {
  const findFirst = vi.fn().mockResolvedValue(profile);
  const db = {
    query: { Profile: { findFirst } },
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

  it("wave 1: always denies an active coach — no active coaching relationship yet", async () => {
    const ctx = makeCtx("user_1", { role: "coach", deactivatedAt: null });
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
});
