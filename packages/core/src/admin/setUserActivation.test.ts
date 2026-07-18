import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminAuditLog, Profile, session } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { setUserActivation } from "./setUserActivation";

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
  profileUpsertReturning?: { deactivatedAt: Date | null }[];
}) {
  const profileFindFirst = vi.fn();
  profileFindFirst.mockResolvedValueOnce(config.actorProfile);
  profileFindFirst.mockResolvedValueOnce(config.targetProfile);

  const userFindFirst = vi
    .fn()
    .mockResolvedValue(config.targetExists ? { id: "target_1" } : undefined);

  const profileInsertValues = vi.fn();
  const auditInsertValues = vi.fn();
  const sessionDeleteWhere = vi.fn().mockResolvedValue(undefined);

  const tx = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        if (table === Profile) {
          profileInsertValues(vals);
          return {
            onConflictDoUpdate: vi.fn(() => ({
              returning: vi
                .fn()
                .mockResolvedValue(config.profileUpsertReturning ?? []),
            })),
          };
        }
        if (table === AdminAuditLog) {
          auditInsertValues(vals);
          return Promise.resolve(undefined);
        }
        throw new Error("unexpected insert table in test");
      }),
    })),
    delete: vi.fn((table: unknown) => {
      if (table === session) {
        return { where: sessionDeleteWhere };
      }
      throw new Error("unexpected delete table in test");
    }),
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
    sessionDeleteWhere,
    transaction,
  };
}

describe("setUserActivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx({ actorId: null, targetExists: true });
    await expect(
      setUserActivation(ctx, { userId: "target_1", active: false }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws CoreError(FORBIDDEN) when the caller isn't an admin", async () => {
    const { ctx } = makeCtx({
      actorId: "user_1",
      actorProfile: { role: "player", deactivatedAt: null },
      targetExists: true,
    });
    await expect(
      setUserActivation(ctx, { userId: "target_1", active: false }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(NOT_FOUND) when the target user doesn't exist", async () => {
    const { ctx } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      targetExists: false,
    });
    await expect(
      setUserActivation(ctx, { userId: "missing", active: false }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CoreError(BAD_REQUEST) when an admin targets themselves", async () => {
    const { ctx, transaction } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      targetExists: true,
    });
    await expect(
      setUserActivation(ctx, { userId: "admin_1", active: false }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("is a no-op (no audit row) when already in the requested state", async () => {
    const { ctx, transaction } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      targetExists: true,
      targetProfile: { role: "player", deactivatedAt: null },
    });

    const result = await setUserActivation(ctx, {
      userId: "target_1",
      active: true,
    });

    expect(result).toEqual({ userId: "target_1", deactivatedAt: null });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("throws CoreError(CONFLICT) when deactivating the last active admin", async () => {
    const { ctx, transaction } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      targetExists: true,
      targetProfile: { role: "admin", deactivatedAt: null },
      otherActiveAdminCount: 0,
    });

    await expect(
      setUserActivation(ctx, { userId: "target_1", active: false }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("deactivates a target, deletes their sessions, and writes user_deactivate", async () => {
    const now = new Date("2026-07-17T12:00:00Z");
    const { ctx, profileInsertValues, auditInsertValues, sessionDeleteWhere } =
      makeCtx({
        actorId: "admin_1",
        actorProfile: { role: "admin", deactivatedAt: null },
        targetExists: true,
        targetProfile: { role: "player", deactivatedAt: null },
        profileUpsertReturning: [{ deactivatedAt: now }],
      });

    const result = await setUserActivation(ctx, {
      userId: "target_1",
      active: false,
    });

    expect(result.userId).toBe("target_1");
    expect(result.deactivatedAt).toEqual(now);
    expect(profileInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "target_1" }),
    );
    expect(sessionDeleteWhere).toHaveBeenCalled();
    expect(auditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin_1",
        targetUserId: "target_1",
        action: "user_deactivate",
      }),
    );
  });

  it("reactivates a target without touching sessions, and writes user_reactivate", async () => {
    const { ctx, auditInsertValues, sessionDeleteWhere } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      targetExists: true,
      targetProfile: { role: "player", deactivatedAt: new Date() },
      profileUpsertReturning: [{ deactivatedAt: null }],
    });

    const result = await setUserActivation(ctx, {
      userId: "target_1",
      active: true,
    });

    expect(result).toEqual({ userId: "target_1", deactivatedAt: null });
    expect(sessionDeleteWhere).not.toHaveBeenCalled();
    expect(auditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user_reactivate" }),
    );
  });

  it("allows deactivating an admin when another active admin remains", async () => {
    const { ctx, auditInsertValues } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      targetExists: true,
      targetProfile: { role: "admin", deactivatedAt: null },
      otherActiveAdminCount: 1,
      profileUpsertReturning: [{ deactivatedAt: new Date() }],
    });

    await setUserActivation(ctx, { userId: "target_1", active: false });

    expect(auditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user_deactivate" }),
    );
  });
});
