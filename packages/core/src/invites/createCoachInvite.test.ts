import { describe, expect, it, vi } from "vitest";

import { AdminAuditLog, CoachInvite } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { createCoachInvite, createCoachInviteInput } from "./createCoachInvite";

interface CallerProfile {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
}

function makeCtx(options: {
  callerProfile: CallerProfile | undefined;
  existingUser?: { id: string } | undefined;
  targetProfile?: CallerProfile | undefined;
  existingInvites?: { revokedAt: Date | null; acceptedAt: Date | null; expiresAt: Date }[];
  insertReturning?: (typeof CoachInvite.$inferSelect)[];
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValueOnce(options.callerProfile)
    .mockResolvedValueOnce(options.targetProfile);
  const userFindFirst = vi.fn().mockResolvedValue(options.existingUser);
  const inviteFindMany = vi
    .fn()
    .mockResolvedValue(options.existingInvites ?? []);

  const auditInsertValues = vi.fn();
  const inviteInsertValues = vi.fn();

  const insert = vi.fn((table: unknown) => ({
    values: vi.fn((vals: Record<string, unknown>) => {
      if (table === CoachInvite) {
        inviteInsertValues(vals);
        return {
          returning: () =>
            Promise.resolve(
              options.insertReturning ?? [
                {
                  id: "invite_1",
                  email: vals.email,
                  token: vals.token,
                  invitedByUserId: vals.invitedByUserId,
                  expiresAt: vals.expiresAt,
                  revokedAt: null,
                  acceptedAt: null,
                  acceptedByUserId: null,
                  createdAt: new Date(),
                },
              ],
            ),
        };
      }
      if (table === AdminAuditLog) {
        auditInsertValues(vals);
        return Promise.resolve(undefined);
      }
      throw new Error("unexpected insert table in test");
    }),
  }));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      user: { findFirst: userFindFirst },
      CoachInvite: { findMany: inviteFindMany },
    },
    insert,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: "admin_1" } as ServiceCtx,
    auditInsertValues,
    inviteInsertValues,
  };
}

describe("createCoachInvite", () => {
  it("throws FORBIDDEN for a non-admin caller", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "coach", deactivatedAt: null },
    });
    await expect(
      createCoachInvite(ctx, { email: "new@example.com", expiresInDays: 14 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CONFLICT when the email already belongs to a coach", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "admin", deactivatedAt: null },
      existingUser: { id: "user_2" },
      targetProfile: { role: "coach", deactivatedAt: null },
    });
    await expect(
      createCoachInvite(ctx, {
        email: "existing-coach@example.com",
        expiresInDays: 14,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws CONFLICT when the email already belongs to an admin", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "admin", deactivatedAt: null },
      existingUser: { id: "user_2" },
      targetProfile: { role: "admin", deactivatedAt: null },
    });
    await expect(
      createCoachInvite(ctx, {
        email: "existing-admin@example.com",
        expiresInDays: 14,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows inviting an email that belongs to an existing player", async () => {
    const { ctx, inviteInsertValues } = makeCtx({
      callerProfile: { role: "admin", deactivatedAt: null },
      existingUser: { id: "user_2" },
      targetProfile: { role: "player", deactivatedAt: null },
    });
    const result = await createCoachInvite(ctx, {
      email: "player@example.com",
      expiresInDays: 14,
    });
    expect(result.acceptPath).toBe(`/invite/${result.invite.token}`);
    expect(inviteInsertValues).toHaveBeenCalledOnce();
  });

  it("throws CONFLICT when a pending unexpired invite already exists for the email", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "admin", deactivatedAt: null },
      existingUser: undefined,
      existingInvites: [
        {
          revokedAt: null,
          acceptedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    });
    await expect(
      createCoachInvite(ctx, { email: "dup@example.com", expiresInDays: 14 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows re-inviting when the only existing invite is expired/revoked/accepted", async () => {
    const { ctx, inviteInsertValues } = makeCtx({
      callerProfile: { role: "admin", deactivatedAt: null },
      existingUser: undefined,
      existingInvites: [
        {
          revokedAt: new Date(),
          acceptedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    });
    await createCoachInvite(ctx, {
      email: "reinvite@example.com",
      expiresInDays: 14,
    });
    expect(inviteInsertValues).toHaveBeenCalledOnce();
  });

  it("creates the invite, records an invite_create audit row, and returns acceptPath", async () => {
    const { ctx, inviteInsertValues, auditInsertValues } = makeCtx({
      callerProfile: { role: "admin", deactivatedAt: null },
      existingUser: undefined,
      existingInvites: [],
    });

    // Mirrors what the tRPC procedure does: parse through the Zod schema
    // (which lowercases/trims the email) before calling the core function.
    const result = await createCoachInvite(
      ctx,
      createCoachInviteInput.parse({
        email: "New-Coach@Example.com",
        expiresInDays: 7,
      }),
    );

    expect(inviteInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new-coach@example.com",
        invitedByUserId: "admin_1",
      }),
    );
    expect(auditInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin_1",
        targetUserId: null,
        action: "invite_create",
        meta: { email: "new-coach@example.com" },
      }),
    );
    expect(result.invite.email).toBe("new-coach@example.com");
    expect(result.acceptPath).toBe(`/invite/${result.invite.token}`);
  });

  it("the input schema lowercases the email before the core function ever sees it", async () => {
    const { ctx, inviteInsertValues } = makeCtx({
      callerProfile: { role: "admin", deactivatedAt: null },
      existingUser: undefined,
      existingInvites: [],
    });
    await createCoachInvite(
      ctx,
      createCoachInviteInput.parse({
        email: "MixedCase@Example.com",
        expiresInDays: 14,
      }),
    );
    expect(inviteInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ email: "mixedcase@example.com" }),
    );
  });
});
