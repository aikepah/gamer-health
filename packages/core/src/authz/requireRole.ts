import type { UserRole } from "@gamer-health/validators";

import type { ServiceCtx } from "../ctx";
import type { Authz } from "./getAuthz";
import { CoreError } from "../lib/errors";
import { getAuthz } from "./getAuthz";

/**
 * `getAuthz` + rejects deactivated accounts. Use at the top of any protected
 * service that doesn't need a specific role.
 */
export async function requireActiveUser(ctx: ServiceCtx): Promise<Authz> {
  const authz = await getAuthz(ctx);
  if (authz.deactivated) {
    throw new CoreError("FORBIDDEN", "Account deactivated");
  }
  return authz;
}

/**
 * `requireActiveUser` + rejects unless the caller's role is in `roles`. No
 * implicit admin bypass — admins must be listed explicitly if they should
 * pass.
 */
export async function requireRole(
  ctx: ServiceCtx,
  roles: readonly UserRole[],
): Promise<Authz> {
  const authz = await requireActiveUser(ctx);
  if (!roles.includes(authz.role)) {
    throw new CoreError("FORBIDDEN");
  }
  return authz;
}
