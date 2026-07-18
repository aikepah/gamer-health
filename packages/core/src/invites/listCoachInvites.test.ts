import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import { listCoachInvites } from "./listCoachInvites";

function makeCtx(rows: unknown[]) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue({ role: "admin", deactivatedAt: null });
  const findMany = vi.fn().mockResolvedValue(rows);
  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachInvite: { findMany },
    },
  } as unknown as ServiceCtx["db"];
  return { db, userId: "admin_1" } as ServiceCtx;
}

function row(overrides: Record<string, unknown>) {
  return {
    id: "invite_1",
    email: "a@example.com",
    token: "tok",
    revokedAt: null,
    acceptedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    invitedBy: { id: "admin_1", name: "Demo Admin" },
    ...overrides,
  };
}

describe("listCoachInvites", () => {
  it("throws FORBIDDEN for a non-admin caller", async () => {
    const profileFindFirst = vi
      .fn()
      .mockResolvedValue({ role: "coach", deactivatedAt: null });
    const db = {
      query: {
        Profile: { findFirst: profileFindFirst },
        CoachInvite: { findMany: vi.fn() },
      },
    } as unknown as ServiceCtx["db"];
    await expect(
      listCoachInvites({ db, userId: "coach_1" }, {}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps rows to their derived status and invitedBy shape", async () => {
    const ctx = makeCtx([
      row({ id: "invite_pending" }),
      row({ id: "invite_revoked", revokedAt: new Date() }),
    ]);
    const result = await listCoachInvites(ctx, {});
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "invite_pending", status: "pending" });
    expect(result[0]?.invitedBy).toEqual({
      userId: "admin_1",
      name: "Demo Admin",
    });
    expect(result[1]).toMatchObject({ id: "invite_revoked", status: "revoked" });
  });

  it("filters by the derived status when given", async () => {
    const ctx = makeCtx([
      row({ id: "invite_pending" }),
      row({ id: "invite_revoked", revokedAt: new Date() }),
    ]);
    const result = await listCoachInvites(ctx, { status: "revoked" });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("invite_revoked");
  });
});
