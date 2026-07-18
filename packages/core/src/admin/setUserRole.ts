import { z } from "zod/v4";

import type { UserRole } from "@gamer-health/validators";
import { and, count, eq, isNull, ne } from "@gamer-health/db";
import { Profile, user } from "@gamer-health/db/schema";
import { USER_ROLES } from "@gamer-health/validators";

import type { ServiceCtx } from "../ctx";
import { requireRole } from "../authz/requireRole";
import { CoreError } from "../lib/errors";
import { recordAdminAudit } from "./audit";

export const setUserRoleInput = z.object({
  userId: z.string().min(1),
  role: z.enum(USER_ROLES),
});
export type SetUserRoleInput = z.infer<typeof setUserRoleInput>;

export interface SetUserRoleResult {
  userId: string;
  role: UserRole;
}

/**
 * Sets a user's authorization role. Admin-only. A no-op (same role, no
 * audit row) when the target is already that role. Demoting the last
 * active admin away from `admin` fails with `CoreError("CONFLICT")`.
 * Creates the target's profile row (`platforms: []`) if it doesn't exist
 * yet — role changes must work for profile-less users.
 */
export async function setUserRole(
  ctx: ServiceCtx,
  input: SetUserRoleInput,
): Promise<SetUserRoleResult> {
  const actor = await requireRole(ctx, ["admin"]);

  const targetUser = await ctx.db.query.user.findFirst({
    where: eq(user.id, input.userId),
    columns: { id: true },
  });
  if (!targetUser) {
    throw new CoreError("NOT_FOUND", "User not found");
  }

  const targetProfile = await ctx.db.query.Profile.findFirst({
    where: eq(Profile.userId, input.userId),
    columns: { role: true },
  });
  const currentRole: UserRole = targetProfile?.role ?? "player";

  if (currentRole === input.role) {
    return { userId: input.userId, role: currentRole };
  }

  if (currentRole === "admin" && input.role !== "admin") {
    const otherActiveAdmins = await ctx.db
      .select({ value: count() })
      .from(Profile)
      .where(
        and(
          eq(Profile.role, "admin"),
          isNull(Profile.deactivatedAt),
          ne(Profile.userId, input.userId),
        ),
      );
    if ((otherActiveAdmins[0]?.value ?? 0) === 0) {
      throw new CoreError("CONFLICT", "Cannot demote the last active admin");
    }
  }

  await ctx.db.transaction(async (tx) => {
    await tx
      .insert(Profile)
      .values({
        userId: input.userId,
        timezone: null,
        platforms: [],
        goals: null,
        role: input.role,
      })
      .onConflictDoUpdate({
        target: Profile.userId,
        set: { role: input.role },
      });

    await recordAdminAudit(tx, {
      actorUserId: actor.userId,
      targetUserId: input.userId,
      action: "role_change",
      meta: { from: currentRole, to: input.role },
    });
  });

  return { userId: input.userId, role: input.role };
}
