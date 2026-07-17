import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import { requireActiveUser, requireRole } from "./requireRole";

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

describe("requireActiveUser", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const ctx = makeCtx(null, undefined);
    await expect(requireActiveUser(ctx)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("throws CoreError(FORBIDDEN) when the profile is deactivated", async () => {
    const ctx = makeCtx("user_1", {
      role: "player",
      deactivatedAt: new Date(),
    });
    await expect(requireActiveUser(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Account deactivated",
    });
  });

  it("returns the authz snapshot for an active user", async () => {
    const ctx = makeCtx("user_1", { role: "coach", deactivatedAt: null });
    await expect(requireActiveUser(ctx)).resolves.toEqual({
      userId: "user_1",
      role: "coach",
      deactivated: false,
    });
  });
});

describe("requireRole", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const ctx = makeCtx(null, undefined);
    await expect(requireRole(ctx, ["admin"])).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("throws CoreError(FORBIDDEN) when deactivated, even with a matching role", async () => {
    const ctx = makeCtx("user_1", {
      role: "admin",
      deactivatedAt: new Date(),
    });
    await expect(requireRole(ctx, ["admin"])).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Account deactivated",
    });
  });

  it("throws CoreError(FORBIDDEN) when the role doesn't match", async () => {
    const ctx = makeCtx("user_1", { role: "player", deactivatedAt: null });
    await expect(requireRole(ctx, ["admin"])).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("does not implicitly let admins pass a coach-only check", async () => {
    const ctx = makeCtx("user_1", { role: "admin", deactivatedAt: null });
    await expect(requireRole(ctx, ["coach"])).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns the authz snapshot when the role matches", async () => {
    const ctx = makeCtx("user_1", { role: "coach", deactivatedAt: null });
    await expect(requireRole(ctx, ["coach", "admin"])).resolves.toEqual({
      userId: "user_1",
      role: "coach",
      deactivated: false,
    });
  });
});
