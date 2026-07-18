import { AdminAuditLog } from "@gamer-health/db/schema";

import type { ServiceCtx, TxDb } from "../ctx";

/**
 * Admin audit action taxonomy (docs/features/admin-users.md). Plain-text
 * constants — like `reward_event.eventType` — so adding an action is a code
 * change, not a migration. Owned by this file; #6/#7 append values here
 * rather than redefining the constant.
 */
export const ADMIN_AUDIT_ACTIONS = [
  "role_change",
  "user_deactivate",
  "user_reactivate",
  "invite_create", // used by #6
  "invite_revoke", // used by #6
  "invite_accept", // used by #6
  "game_rename", // used by #7
  "game_merge", // used by #7
  "game_delete", // used by #7
  "habit_def_create", // used by #7
  "habit_def_update", // used by #7
  "habit_def_archive", // used by #7
  "habit_def_unarchive", // used by #7
  "habit_def_delete", // used by #7
] as const;
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

export interface RecordAdminAuditEntry {
  actorUserId: string;
  targetUserId?: string | null;
  action: AdminAuditAction;
  meta?: Record<string, unknown>;
}

/**
 * Appends one row to the append-only `admin_audit_log`. Callers that need
 * the write to be atomic with other changes should pass the transaction's
 * `tx` (see `packages/core/src/ctx.ts`).
 */
export async function recordAdminAudit(
  db: ServiceCtx["db"] | TxDb,
  entry: RecordAdminAuditEntry,
): Promise<void> {
  await db.insert(AdminAuditLog).values({
    actorUserId: entry.actorUserId,
    targetUserId: entry.targetUserId ?? null,
    action: entry.action,
    meta: entry.meta ?? {},
  });
}
