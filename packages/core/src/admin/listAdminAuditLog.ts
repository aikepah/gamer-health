import { z } from "zod/v4";

import { desc, eq } from "@gamer-health/db";
import { AdminAuditLog } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { requireRole } from "../authz/requireRole";

export const listAdminAuditLogInput = z.object({
  targetUserId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type ListAdminAuditLogInput = z.infer<typeof listAdminAuditLogInput>;

export interface AdminAuditLogRow {
  id: string;
  action: string;
  meta: Record<string, unknown>;
  createdAt: Date;
  actor: { userId: string; name: string; email: string };
  target: { userId: string; name: string; email: string } | null;
}

/** Newest-first admin audit trail, admin-only. See `recordAdminAudit`. */
export async function listAdminAuditLog(
  ctx: ServiceCtx,
  input: ListAdminAuditLogInput,
): Promise<AdminAuditLogRow[]> {
  await requireRole(ctx, ["admin"]);

  const rows = await ctx.db.query.AdminAuditLog.findMany({
    where: input.targetUserId
      ? eq(AdminAuditLog.targetUserId, input.targetUserId)
      : undefined,
    orderBy: desc(AdminAuditLog.createdAt),
    limit: input.limit,
    with: {
      actor: { columns: { id: true, name: true, email: true } },
      target: { columns: { id: true, name: true, email: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    meta: row.meta,
    createdAt: row.createdAt,
    actor: {
      userId: row.actor.id,
      name: row.actor.name,
      email: row.actor.email,
    },
    target: row.target
      ? {
          userId: row.target.id,
          name: row.target.name,
          email: row.target.email,
        }
      : null,
  }));
}
