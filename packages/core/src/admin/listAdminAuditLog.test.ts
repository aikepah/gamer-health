import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import { listAdminAuditLog } from "./listAdminAuditLog";

function makeCtx(options: {
  actorId: string | null;
  actorProfile?: { role: "player" | "coach" | "admin"; deactivatedAt: null };
  rows?: unknown[];
}) {
  const findFirst = vi.fn().mockResolvedValue(options.actorProfile);
  const auditFindMany = vi.fn().mockResolvedValue(options.rows ?? []);

  const db = {
    query: {
      Profile: { findFirst },
      AdminAuditLog: { findMany: auditFindMany },
    },
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: options.actorId } as ServiceCtx, auditFindMany };
}

describe("listAdminAuditLog", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx({ actorId: null });
    await expect(listAdminAuditLog(ctx, { limit: 50 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("throws CoreError(FORBIDDEN) when the caller isn't an admin", async () => {
    const { ctx } = makeCtx({
      actorId: "user_1",
      actorProfile: { role: "player", deactivatedAt: null },
    });
    await expect(listAdminAuditLog(ctx, { limit: 50 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("maps rows, treating a missing target as null", async () => {
    const createdAt = new Date("2026-07-16T09:00:00Z");
    const { ctx, auditFindMany } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      rows: [
        {
          id: "audit_1",
          action: "role_change",
          meta: { from: "player", to: "coach" },
          createdAt,
          actor: { id: "admin_1", name: "Demo Admin", email: "admin@x.dev" },
          target: { id: "user_1", name: "Demo Player", email: "player@x.dev" },
        },
        {
          id: "audit_2",
          action: "game_delete",
          meta: {},
          createdAt,
          actor: { id: "admin_1", name: "Demo Admin", email: "admin@x.dev" },
          target: null,
        },
      ],
    });

    const result = await listAdminAuditLog(ctx, { limit: 50 });

    expect(result).toEqual([
      {
        id: "audit_1",
        action: "role_change",
        meta: { from: "player", to: "coach" },
        createdAt,
        actor: { userId: "admin_1", name: "Demo Admin", email: "admin@x.dev" },
        target: {
          userId: "user_1",
          name: "Demo Player",
          email: "player@x.dev",
        },
      },
      {
        id: "audit_2",
        action: "game_delete",
        meta: {},
        createdAt,
        actor: { userId: "admin_1", name: "Demo Admin", email: "admin@x.dev" },
        target: null,
      },
    ]);
    expect(auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
  });

  it("passes a targetUserId filter through to the query", async () => {
    const { ctx, auditFindMany } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      rows: [],
    });

    await listAdminAuditLog(ctx, { targetUserId: "user_1", limit: 10 });

    const call = auditFindMany.mock.calls[0]?.[0] as
      | { where?: unknown; limit: number }
      | undefined;
    expect(call?.limit).toBe(10);
    expect(call?.where).toBeDefined();
  });
});
