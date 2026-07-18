import { describe, expect, it, vi } from "vitest";

import type { CoachInvite } from "@gamer-health/db/schema";
import { AdminAuditLog } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { revokeCoachInvite } from "./revokeCoachInvite";

type InviteRow = typeof CoachInvite.$inferSelect;

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
  callerProfile?: { role: "player" | "coach" | "admin"; deactivatedAt: Date | null };
  invite?: InviteRow | undefined;
  updateReturning?: InviteRow[];
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue(
      options.callerProfile ?? { role: "admin", deactivatedAt: null },
    );
  const inviteFindFirst = vi.fn().mockResolvedValue(options.invite);

  const auditInsertValues = vi.fn();
  const updateSet = vi.fn();

  const insert = vi.fn((table: unknown) => ({
    values: vi.fn((vals: Record<string, unknown>) => {
      if (table === AdminAuditLog) {
        auditInsertValues(vals);
        return Promise.resolve(undefined);
      }
      throw new Error("unexpected insert table in test");
    }),
  }));

  const update = vi.fn(() => ({
    set: vi.fn((vals: Record<string, unknown>) => {
      updateSet(vals);
      return {
        where: () => ({
          returning: () =>
            Promise.resolve(
              options.updateReturning ??
                (options.invite
                  ? [{ ...options.invite, revokedAt: vals.revokedAt as Date }]
                  : []),
            ),
        }),
      };
    }),
  }));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachInvite: { findFirst: inviteFindFirst },
    },
    insert,
    update,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: "admin_1" } as ServiceCtx, auditInsertValues };
}

describe("revokeCoachInvite", () => {
  it("throws FORBIDDEN for a non-admin caller", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "coach", deactivatedAt: null },
      invite: makeInvite(),
    });
    await expect(
      revokeCoachInvite(ctx, { inviteId: "invite_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND when the invite doesn't exist", async () => {
    const { ctx } = makeCtx({ invite: undefined });
    await expect(
      revokeCoachInvite(ctx, { inviteId: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT when the invite is already accepted", async () => {
    const { ctx } = makeCtx({
      invite: makeInvite({
        acceptedAt: new Date(),
        acceptedByUserId: "coach_1",
      }),
    });
    await expect(
      revokeCoachInvite(ctx, { inviteId: "invite_1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws CONFLICT when the invite is already revoked", async () => {
    const { ctx } = makeCtx({
      invite: makeInvite({ revokedAt: new Date() }),
    });
    await expect(
      revokeCoachInvite(ctx, { inviteId: "invite_1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws CONFLICT when the invite is expired", async () => {
    const { ctx } = makeCtx({
      invite: makeInvite({ expiresAt: new Date(Date.now() - 60_000) }),
    });
    await expect(
      revokeCoachInvite(ctx, { inviteId: "invite_1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("revokes a pending invite and records an invite_revoke audit row", async () => {
    const { ctx, auditInsertValues } = makeCtx({ invite: makeInvite() });

    const result = await revokeCoachInvite(ctx, { inviteId: "invite_1" });

    expect(result.revokedAt).toBeInstanceOf(Date);
    expect(auditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin_1",
        targetUserId: null,
        action: "invite_revoke",
        meta: { email: "coach@example.com" },
      }),
    );
  });
});
