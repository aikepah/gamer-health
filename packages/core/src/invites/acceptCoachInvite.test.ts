import { describe, expect, it, vi } from "vitest";

import type { CoachInvite } from "@gamer-health/db/schema";
import { AdminAuditLog, Profile } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { acceptCoachInvite } from "./acceptCoachInvite";

type InviteRow = typeof CoachInvite.$inferSelect;
interface ProfileLite {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

function makeInvite(overrides: Partial<InviteRow> = {}): InviteRow {
  return {
    id: "invite_1",
    email: "coach@example.com",
    token: "tok_123",
    invitedByUserId: "admin_1",
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    acceptedAt: null,
    acceptedByUserId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeCtx(options: {
  callerProfile?: ProfileLite | undefined;
  invite?: InviteRow | undefined;
  callerUser?: { id: string; email: string } | undefined;
  currentProfileInTx?: ProfileLite | undefined;
  conditionalUpdateReturning?: InviteRow[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(options.callerProfile);
  const inviteFindFirst = vi.fn().mockResolvedValue(options.invite);
  const userFindFirst = vi.fn().mockResolvedValue(options.callerUser);

  const txProfileFindFirst = vi
    .fn()
    .mockResolvedValue(options.currentProfileInTx);
  const txProfileInsertValues = vi.fn();
  const txAuditInsertValues = vi.fn();
  const txUpdateSet = vi.fn();

  const tx = {
    query: { Profile: { findFirst: txProfileFindFirst } },
    update: vi.fn(() => ({
      set: vi.fn((vals: Record<string, unknown>) => {
        txUpdateSet(vals);
        return {
          where: () => ({
            returning: () =>
              Promise.resolve(
                options.conditionalUpdateReturning ?? [
                  {
                    ...(options.invite ?? makeInvite()),
                    acceptedAt: vals.acceptedAt as Date,
                    acceptedByUserId: vals.acceptedByUserId as string,
                  },
                ],
              ),
          }),
        };
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        if (table === Profile) {
          txProfileInsertValues(vals);
          return {
            onConflictDoUpdate: vi.fn(() => Promise.resolve(undefined)),
          };
        }
        if (table === AdminAuditLog) {
          txAuditInsertValues(vals);
          return Promise.resolve(undefined);
        }
        throw new Error("unexpected insert table in test");
      }),
    })),
  };

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachInvite: { findFirst: inviteFindFirst },
      user: { findFirst: userFindFirst },
    },
    transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: "user_1" } as ServiceCtx,
    txProfileInsertValues,
    txAuditInsertValues,
    txUpdateSet,
  };
}

describe("acceptCoachInvite", () => {
  it("throws NOT_FOUND for an unknown token", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      invite: undefined,
    });
    await expect(
      acceptCoachInvite(ctx, { token: "unknown" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT naming the state for an already-accepted invite", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      invite: makeInvite({
        acceptedAt: new Date(),
        acceptedByUserId: "someone",
      }),
    });
    await expect(
      acceptCoachInvite(ctx, { token: "tok_123" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("already been accepted") as string,
    });
  });

  it("throws CONFLICT for a revoked invite", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      invite: makeInvite({ revokedAt: new Date() }),
    });
    await expect(
      acceptCoachInvite(ctx, { token: "tok_123" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws CONFLICT for an expired invite", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      invite: makeInvite({ expiresAt: new Date(Date.now() - 60_000) }),
    });
    await expect(
      acceptCoachInvite(ctx, { token: "tok_123" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws FORBIDDEN when the caller's email doesn't match the invite", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      invite: makeInvite({ email: "coach@example.com" }),
      callerUser: { id: "user_1", email: "someone-else@example.com" },
    });
    await expect(
      acceptCoachInvite(ctx, { token: "tok_123" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "This invite is for a different email address",
    });
  });

  it("matches emails case-insensitively and with surrounding whitespace trimmed", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      invite: makeInvite({ email: "coach@example.com" }),
      callerUser: { id: "user_1", email: "  Coach@Example.com  " },
      currentProfileInTx: { role: "player", deactivatedAt: null },
    });
    const result = await acceptCoachInvite(ctx, { token: "tok_123" });
    expect(result.role).toBe("coach");
  });

  it("promotes a player to coach and records an invite_accept audit row", async () => {
    const { ctx, txProfileInsertValues, txAuditInsertValues } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      invite: makeInvite({ email: "coach@example.com" }),
      callerUser: { id: "user_1", email: "coach@example.com" },
      currentProfileInTx: { role: "player", deactivatedAt: null },
    });

    const result = await acceptCoachInvite(ctx, { token: "tok_123" });

    expect(result).toEqual({ role: "coach" });
    expect(txProfileInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", role: "coach" }),
    );
    expect(txAuditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user_1",
        targetUserId: "user_1",
        action: "invite_accept",
        meta: { inviteId: "invite_1" },
      }),
    );
  });

  it("is a no-op role-wise when the caller is already a coach", async () => {
    const { ctx, txProfileInsertValues } = makeCtx({
      callerProfile: { role: "coach", deactivatedAt: null },
      invite: makeInvite({ email: "coach@example.com" }),
      callerUser: { id: "user_1", email: "coach@example.com" },
      currentProfileInTx: { role: "coach", deactivatedAt: null },
    });

    const result = await acceptCoachInvite(ctx, { token: "tok_123" });

    expect(result).toEqual({ role: "coach" });
    expect(txProfileInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ role: "coach" }),
    );
  });

  it("never demotes an admin who accepts an invite", async () => {
    const { ctx, txProfileInsertValues } = makeCtx({
      callerProfile: { role: "admin", deactivatedAt: null },
      invite: makeInvite({ email: "coach@example.com" }),
      callerUser: { id: "user_1", email: "coach@example.com" },
      currentProfileInTx: { role: "admin", deactivatedAt: null },
    });

    const result = await acceptCoachInvite(ctx, { token: "tok_123" });

    expect(result).toEqual({ role: "admin" });
    expect(txProfileInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ role: "admin" }),
    );
  });

  it("throws CONFLICT when a concurrent request already resolved the invite", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      invite: makeInvite({ email: "coach@example.com" }),
      callerUser: { id: "user_1", email: "coach@example.com" },
      conditionalUpdateReturning: [],
    });

    await expect(
      acceptCoachInvite(ctx, { token: "tok_123" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
