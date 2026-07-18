import { randomBytes } from "node:crypto";

import { z } from "zod/v4";

import { eq, sql } from "@gamer-health/db";
import { CoachInvite, Profile, user } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { recordAdminAudit } from "../admin/audit";
import { requireRole } from "../authz/requireRole";
import { CoreError } from "../lib/errors";
import { coachInviteStatus } from "./status";

export const createCoachInviteInput = z.object({
  email: z
    .email()
    .max(255)
    .transform((e) => e.trim().toLowerCase()),
  expiresInDays: z.number().int().min(1).max(90).default(14),
});
export type CreateCoachInviteInput = z.infer<typeof createCoachInviteInput>;

export type CoachInviteRow = typeof CoachInvite.$inferSelect;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Admin-only: invites a coach by email. Guards (`CONFLICT`): the email
 * already belongs to an existing coach/admin, or a pending unexpired invite
 * for it already exists (revoke it first). Writes an `invite_create` audit
 * row (target null, meta `{ email }`).
 */
export async function createCoachInvite(
  ctx: ServiceCtx,
  input: CreateCoachInviteInput,
): Promise<{ invite: CoachInviteRow; acceptPath: string }> {
  const authz = await requireRole(ctx, ["admin"]);

  const existingUser = await ctx.db.query.user.findFirst({
    where: sql`lower(${user.email}) = ${input.email}`,
  });
  if (existingUser) {
    const profile = await ctx.db.query.Profile.findFirst({
      where: eq(Profile.userId, existingUser.id),
    });
    if (profile?.role === "coach" || profile?.role === "admin") {
      throw new CoreError(
        "CONFLICT",
        "This email already belongs to a coach or admin",
      );
    }
  }

  const existingInvites = await ctx.db.query.CoachInvite.findMany({
    where: eq(CoachInvite.email, input.email),
  });
  const now = new Date();
  const hasPending = existingInvites.some(
    (invite) => coachInviteStatus(invite, now) === "pending",
  );
  if (hasPending) {
    throw new CoreError(
      "CONFLICT",
      "A pending invite already exists for this email — revoke it first",
    );
  }

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + input.expiresInDays * MS_PER_DAY);

  const [invite] = await ctx.db
    .insert(CoachInvite)
    .values({
      email: input.email,
      token,
      invitedByUserId: authz.userId,
      expiresAt,
    })
    .returning();
  if (!invite) {
    throw new CoreError("CONFLICT", "Failed to create invite");
  }

  await recordAdminAudit(ctx.db, {
    actorUserId: authz.userId,
    targetUserId: null,
    action: "invite_create",
    meta: { email: input.email },
  });

  return { invite, acceptPath: `/invite/${token}` };
}
