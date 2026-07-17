import type { UserRole } from "@gamer-health/validators";
import { eq } from "@gamer-health/db";
import { Profile } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { requireUserId } from "../lib/auth";

/**
 * The caller's authorization snapshot: role + deactivation status.
 * See docs/features/roles-authorization.md.
 */
export interface Authz {
  userId: string;
  role: UserRole;
  deactivated: boolean;
}

/**
 * Reads the caller's authz snapshot from `profile.role` /
 * `profile.deactivatedAt`. A user with no profile row is an active player —
 * this never creates a profile row just to read a role.
 *
 * Does NOT throw on deactivation; callers that need to reject deactivated
 * users should use `requireActiveUser` instead.
 */
export async function getAuthz(ctx: ServiceCtx): Promise<Authz> {
  const userId = requireUserId(ctx);

  const profile = await ctx.db.query.Profile.findFirst({
    where: eq(Profile.userId, userId),
    columns: { role: true, deactivatedAt: true },
  });

  return {
    userId,
    role: profile?.role ?? "player",
    deactivated: profile?.deactivatedAt != null,
  };
}
