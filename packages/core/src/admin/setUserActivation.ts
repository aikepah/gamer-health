import { z } from "zod/v4";

import { and, count, eq, isNull, ne } from "@gamer-health/db";
import { Profile, session, user } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { requireRole } from "../authz/requireRole";
import { CoreError } from "../lib/errors";
import { recordAdminAudit } from "./audit";

export const setUserActivationInput = z.object({
  userId: z.string().min(1),
  active: z.boolean(),
});
export type SetUserActivationInput = z.infer<typeof setUserActivationInput>;

export interface SetUserActivationResult {
  userId: string;
  deactivatedAt: Date | null;
}

/**
 * Activates/deactivates a user. Admin-only; admins can't target themselves
 * (`CoreError("BAD_REQUEST")` — prevents the lockout footgun, another admin
 * must do it). A no-op (no audit row) when already in the requested state.
 * Deactivating the last active admin fails with `CoreError("CONFLICT")`.
 * Deactivation also deletes the target's live Better Auth sessions so the
 * FORBIDDEN gate on `protectedProcedure` takes effect immediately. Creates
 * the target's profile row if it doesn't exist yet.
 */
export async function setUserActivation(
  ctx: ServiceCtx,
  input: SetUserActivationInput,
): Promise<SetUserActivationResult> {
  const actor = await requireRole(ctx, ["admin"]);

  const targetUser = await ctx.db.query.user.findFirst({
    where: eq(user.id, input.userId),
    columns: { id: true },
  });
  if (!targetUser) {
    throw new CoreError("NOT_FOUND", "User not found");
  }

  if (input.userId === actor.userId) {
    throw new CoreError(
      "BAD_REQUEST",
      "Admins cannot change their own active status",
    );
  }

  const targetProfile = await ctx.db.query.Profile.findFirst({
    where: eq(Profile.userId, input.userId),
    columns: { role: true, deactivatedAt: true },
  });
  const currentRole = targetProfile?.role ?? "player";
  const currentlyActive = (targetProfile?.deactivatedAt ?? null) == null;

  if (currentlyActive === input.active) {
    return {
      userId: input.userId,
      deactivatedAt: targetProfile?.deactivatedAt ?? null,
    };
  }

  if (!input.active && currentRole === "admin") {
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
      throw new CoreError(
        "CONFLICT",
        "Cannot deactivate the last active admin",
      );
    }
  }

  const newDeactivatedAt = input.active ? null : new Date();

  const deactivatedAt = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(Profile)
      .values({
        userId: input.userId,
        timezone: null,
        platforms: [],
        goals: null,
        deactivatedAt: newDeactivatedAt,
      })
      .onConflictDoUpdate({
        target: Profile.userId,
        set: { deactivatedAt: newDeactivatedAt },
      })
      .returning({ deactivatedAt: Profile.deactivatedAt });

    if (!input.active) {
      await tx.delete(session).where(eq(session.userId, input.userId));
    }

    await recordAdminAudit(tx, {
      actorUserId: actor.userId,
      targetUserId: input.userId,
      action: input.active ? "user_reactivate" : "user_deactivate",
    });

    return row?.deactivatedAt ?? newDeactivatedAt;
  });

  return { userId: input.userId, deactivatedAt };
}
