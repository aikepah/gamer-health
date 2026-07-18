import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminAuditLog, Profile } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { setUserRole } from "./setUserRole";

interface ProfileSnapshot {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

function makeSelectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

function makeCtx(config: {
  actorId: string | null;
  actorProfile?: ProfileSnapshot;
  targetExists: boolean;
  targetProfile?: ProfileSnapshot;
  otherActiveAdminCount?: number;
}) {
  const profileFindFirst = vi.fn();
  // First call: getAuthz reading the actor's own profile (inside requireRole).
  profileFindFirst.mockResolvedValueOnce(config.actorProfile);
  // Second call: setUserRole's lookup of the target's current role.
  profileFindFirst.mockResolvedValueOnce(config.targetProfile);

  const userFindFirst = vi
    .fn()
    .mockResolvedValue(config.targetExists ? { id: "target_1" } : undefined);

  const profileInsertValues = vi.fn();
  const auditInsertValues = vi.fn();

  const tx = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        if (table === Profile) {
          profileInsertValues(vals);
          return {
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          };
        }
        if (table === AdminAuditLog) {
          auditInsertValues(vals);
          return Promise.resolve(undefined);
        }
        throw new Error("unexpected insert table in test");
      }),
    })),
  };

  const select = vi.fn(() =>
    makeSelectChain([{ value: config.otherActiveAdminCount ?? 1 }]),
  );
  const transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(tx));

  const db = {
    query: {
      user: { findFirst: userFindFirst },
      Profile: { findFirst: profileFindFirst },
    },
    select,
    transaction,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.actorId } as ServiceCtx,
    profileInsertValues,
    auditInsertValues,
    transaction,
    select,
  };
}

describe("setUserRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx({ actorId: null, targetExists: true });
    await expect(
      setUserRole(ctx, { userId: "target_1", role: "coach" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws CoreError(FORBIDDEN) when the caller isn't an admin", async () => {
    const { ctx } = makeCtx({
      actorId: "user_1",
      actorProfile: { role: "player", deactivatedAt: null },
      targetExists: true,
    });
    await expect(
      setUserRole(ctx, { userId: "target_1", role: "coach" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(NOT_FOUND) when the target user doesn't exist", async () => {
    const { ctx } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      targetExists: false,
    });
    await expect(
      setUserRole(ctx, { userId: "missing", role: "coach" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is a no-op (no audit row) when the target is already that role", async () => {
    const { ctx, transaction } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      targetExists: true,
      targetProfile: { role: "coach", deactivatedAt: null },
    });

    const result = await setUserRole(ctx, {
      userId: "target_1",
      role: "coach",
    });

    expect(result).toEqual({ userId: "target_1", role: "coach" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("defaults a profile-less target to 'player' for the current-role comparison", async () => {
    const { ctx, transaction } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      targetExists: true,
      targetProfile: undefined,
    });

    const result = await setUserRole(ctx, {
      userId: "target_1",
      role: "player",
    });

    expect(result).toEqual({ userId: "target_1", role: "player" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("throws CoreError(CONFLICT) when demoting the last active admin", async () => {
    const { ctx, transaction } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      targetExists: true,
      targetProfile: { role: "admin", deactivatedAt: null },
      otherActiveAdminCount: 0,
    });

    await expect(
      setUserRole(ctx, { userId: "target_1", role: "coach" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("allows demoting an admin when another active admin remains", async () => {
    const { ctx, profileInsertValues, auditInsertValues } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      targetExists: true,
      targetProfile: { role: "admin", deactivatedAt: null },
      otherActiveAdminCount: 1,
    });

    const result = await setUserRole(ctx, {
      userId: "target_1",
      role: "coach",
    });

    expect(result).toEqual({ userId: "target_1", role: "coach" });
    expect(profileInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "target_1", role: "coach" }),
    );
    expect(auditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin_1",
        targetUserId: "target_1",
        action: "role_change",
        meta: { from: "admin", to: "coach" },
      }),
    );
  });

  it("upserts a profile with platforms: [] for a profile-less target, and writes the audit row", async () => {
    const { ctx, profileInsertValues, auditInsertValues } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      targetExists: true,
      targetProfile: undefined,
    });

    const result = await setUserRole(ctx, {
      userId: "target_1",
      role: "coach",
    });

    expect(result).toEqual({ userId: "target_1", role: "coach" });
    expect(profileInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "target_1",
        platforms: [],
        role: "coach",
      }),
    );
    expect(auditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "role_change",
        meta: { from: "player", to: "coach" },
      }),
    );
  });
});
