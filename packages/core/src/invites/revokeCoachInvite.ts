import { z } from "zod/v4";

import { eq } from "@gamer-health/db";
import { CoachInvite } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import type { CoachInviteRow } from "./createCoachInvite";
import { recordAdminAudit } from "../admin/audit";
import { requireRole } from "../authz/requireRole";
import { CoreError } from "../lib/errors";
import { coachInviteStatus } from "./status";

export const revokeCoachInviteInput = z.object({ inviteId: z.uuid() });
export type RevokeCoachInviteInput = z.infer<typeof revokeCoachInviteInput>;

/**
 * Admin-only: revokes a pending invite. `NOT_FOUND` if the invite doesn't
 * exist; `CONFLICT` if it isn't currently `pending` (already accepted,
 * revoked, or expired).
 */
export async function revokeCoachInvite(
  ctx: ServiceCtx,
  input: RevokeCoachInviteInput,
): Promise<CoachInviteRow> {
  const authz = await requireRole(ctx, ["admin"]);

  const invite = await ctx.db.query.CoachInvite.findFirst({
    where: eq(CoachInvite.id, input.inviteId),
  });
  if (!invite) {
    throw new CoreError("NOT_FOUND", "Invite not found");
  }

  const status = coachInviteStatus(invite);
  if (status !== "pending") {
    throw new CoreError("CONFLICT", `Invite is already ${status}`);
  }

  const [updated] = await ctx.db
    .update(CoachInvite)
    .set({ revokedAt: new Date() })
    .where(eq(CoachInvite.id, input.inviteId))
    .returning();
  if (!updated) {
    throw new CoreError("CONFLICT", "Failed to revoke invite");
  }

  await recordAdminAudit(ctx.db, {
    actorUserId: authz.userId,
    targetUserId: null,
    action: "invite_revoke",
    meta: { email: invite.email },
  });

  return updated;
}
