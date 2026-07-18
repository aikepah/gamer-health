import { z } from "zod/v4";

import type { UserRole } from "@gamer-health/validators";
import { and, eq, isNull } from "@gamer-health/db";
import { CoachInvite, Profile, user } from "@gamer-health/db/schema";

import type { ServiceCtx, TxDb } from "../ctx";
import type { CoachInviteStatus } from "./status";
import { recordAdminAudit } from "../admin/audit";
import { requireActiveUser } from "../authz/requireRole";
import { CoreError } from "../lib/errors";
import { coachInviteStatus } from "./status";

export const acceptCoachInviteInput = z.object({
  token: z.string().min(1).max(64),
});
export type AcceptCoachInviteInput = z.infer<typeof acceptCoachInviteInput>;

const NON_PENDING_MESSAGES: Partial<Record<CoachInviteStatus, string>> = {
  accepted: "This invite has already been accepted",
  revoked: "This invite has been revoked",
  expired: "This invite has expired",
};

/**
 * Accepts a coach invite for the signed-in caller.
 *
 * Guards: `NOT_FOUND` on an unknown token; `CONFLICT` (message names the
 * actual state) unless the invite is currently `pending`; `FORBIDDEN` if the
 * caller's account email (lowercased) doesn't match the invited email — no
 * transfer, no "accept anyway".
 *
 * Accepting when already `coach` is a no-op role-wise; already `admin` keeps
 * admin (never demotes) — both still mark the invite accepted. The
 * conditional update inside the transaction makes a concurrent double-accept
 * (or an accept racing a revoke) fail with `CONFLICT` instead of double
 * -applying side effects.
 */
export async function acceptCoachInvite(
  ctx: ServiceCtx,
  input: AcceptCoachInviteInput,
): Promise<{ role: UserRole }> {
  const authz = await requireActiveUser(ctx);

  const invite = await ctx.db.query.CoachInvite.findFirst({
    where: eq(CoachInvite.token, input.token),
  });
  if (!invite) {
    throw new CoreError("NOT_FOUND", "Invite not found");
  }

  const status = coachInviteStatus(invite);
  if (status !== "pending") {
    throw new CoreError(
      "CONFLICT",
      NON_PENDING_MESSAGES[status] ?? `Invite is ${status}`,
    );
  }

  const callerUser = await ctx.db.query.user.findFirst({
    where: eq(user.id, authz.userId),
  });
  if (!callerUser) {
    throw new CoreError("NOT_FOUND", "User not found");
  }
  if (callerUser.email.trim().toLowerCase() !== invite.email) {
    throw new CoreError(
      "FORBIDDEN",
      "This invite is for a different email address",
    );
  }

  return ctx.db.transaction(async (tx: TxDb) => {
    const [accepted] = await tx
      .update(CoachInvite)
      .set({ acceptedAt: new Date(), acceptedByUserId: authz.userId })
      .where(
        and(
          eq(CoachInvite.id, invite.id),
          isNull(CoachInvite.acceptedAt),
          isNull(CoachInvite.revokedAt),
        ),
      )
      .returning();
    if (!accepted) {
      throw new CoreError("CONFLICT", "This invite has already been resolved");
    }

    const currentProfile = await tx.query.Profile.findFirst({
      where: eq(Profile.userId, authz.userId),
    });
    const currentRole = currentProfile?.role ?? "player";
    const newRole: UserRole = currentRole === "player" ? "coach" : currentRole;

    await tx
      .insert(Profile)
      .values({
        userId: authz.userId,
        timezone: null,
        platforms: [],
        goals: null,
        role: newRole,
      })
      .onConflictDoUpdate({
        target: Profile.userId,
        set: { role: newRole },
      });

    await recordAdminAudit(tx, {
      actorUserId: authz.userId,
      targetUserId: authz.userId,
      action: "invite_accept",
      meta: { inviteId: invite.id },
    });

    return { role: newRole };
  });
}
