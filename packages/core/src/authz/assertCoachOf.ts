import type { ServiceCtx } from "../ctx";
import { CoreError } from "../lib/errors";
import { requireRole } from "./requireRole";

/**
 * Asserts the caller is an active coach with an ACTIVE coaching relationship
 * to `playerUserId`.
 *
 * Wave 1 (#4) ships this deny-all: it verifies the caller is an active coach
 * and then unconditionally throws FORBIDDEN. The coaching-relationship table
 * lands in #11, which replaces only the final throw with a
 * `status = 'active'` relationship lookup — the signature and call sites are
 * final now. This is deliberate: deny-by-default means nothing built against
 * this contract can leak player data before #11 lands.
 *
 * Admins do not implicitly pass this check — only role "coach" does.
 */
export async function assertCoachOf(
  ctx: ServiceCtx,
  _playerUserId: string,
): Promise<void> {
  await requireRole(ctx, ["coach"]);
  throw new CoreError("FORBIDDEN", "No active coaching relationship");
}
