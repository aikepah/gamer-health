import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { ProfileRow } from "./getOrCreateProfile";
import { CoreError } from "../lib/errors";
import { updateProfile } from "./updateProfile";

function makeCtx(
  userId: string | null,
  returningResult: ProfileRow[],
): { ctx: ServiceCtx; insert: ReturnType<typeof vi.fn> } {
  const returning = vi.fn().mockResolvedValue(returningResult);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = vi.fn().mockReturnValue({ values });

  const db = { insert } as unknown as ServiceCtx["db"];
  return { ctx: { db, userId }, insert };
}

describe("updateProfile", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx(null, []);
    await expect(
      updateProfile(ctx, { timezone: "UTC", platforms: [], goals: null }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws CoreError(BAD_REQUEST) for an unknown timezone", async () => {
    const { ctx, insert } = makeCtx("user_1", []);
    await expect(
      updateProfile(ctx, {
        timezone: "Not/AZone",
        platforms: [],
        goals: null,
      }),
    ).rejects.toThrowError(CoreError);
    expect(insert).not.toHaveBeenCalled();
  });

  it("upserts and returns the row for a valid timezone", async () => {
    const row: ProfileRow = {
      userId: "user_1",
      timezone: "America/Chicago",
      platforms: ["PC"],
      goals: "Stay healthy",
      role: "player",
      deactivatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { ctx } = makeCtx("user_1", [row]);

    const result = await updateProfile(ctx, {
      timezone: "America/Chicago",
      platforms: ["PC"],
      goals: "Stay healthy",
    });

    expect(result).toBe(row);
  });
});
