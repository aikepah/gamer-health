import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import { getCoachInviteByToken } from "./getCoachInviteByToken";

function makeCtx(invite: unknown) {
  const findFirst = vi.fn().mockResolvedValue(invite);
  const db = {
    query: { CoachInvite: { findFirst } },
  } as unknown as ServiceCtx["db"];
  return { db, userId: null } as ServiceCtx;
}

describe("getCoachInviteByToken", () => {
  it("throws NOT_FOUND for an unknown token", async () => {
    const ctx = makeCtx(undefined);
    await expect(
      getCoachInviteByToken(ctx, { token: "unknown" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns only email/status/expiresAt for a known token", async () => {
    const ctx = makeCtx({
      email: "coach@example.com",
      token: "tok_123",
      revokedAt: null,
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const result = await getCoachInviteByToken(ctx, { token: "tok_123" });
    expect(result.email).toBe("coach@example.com");
    expect(result.status).toBe("pending");
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it("derives revoked status", async () => {
    const ctx = makeCtx({
      email: "coach@example.com",
      token: "tok_123",
      revokedAt: new Date(),
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const result = await getCoachInviteByToken(ctx, { token: "tok_123" });
    expect(result.status).toBe("revoked");
  });
});
