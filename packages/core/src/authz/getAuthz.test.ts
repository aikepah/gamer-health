import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import { getAuthz } from "./getAuthz";

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

describe("getAuthz", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const ctx = makeCtx(null, undefined);
    await expect(getAuthz(ctx)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("defaults to an active player when no profile row exists", async () => {
    const ctx = makeCtx("user_1", undefined);
    await expect(getAuthz(ctx)).resolves.toEqual({
      userId: "user_1",
      role: "player",
      deactivated: false,
    });
  });

  it("reflects the profile's role and deactivation status", async () => {
    const ctx = makeCtx("user_1", {
      role: "admin",
      deactivatedAt: new Date("2026-01-01"),
    });
    await expect(getAuthz(ctx)).resolves.toEqual({
      userId: "user_1",
      role: "admin",
      deactivated: true,
    });
  });

  it("treats a null deactivatedAt as active", async () => {
    const ctx = makeCtx("user_1", { role: "coach", deactivatedAt: null });
    await expect(getAuthz(ctx)).resolves.toEqual({
      userId: "user_1",
      role: "coach",
      deactivated: false,
    });
  });
});
