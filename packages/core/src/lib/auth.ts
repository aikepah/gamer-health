import type { ServiceCtx } from "../ctx";
import { CoreError } from "./errors";

/**
 * Returns the authenticated user id, or throws `CoreError("UNAUTHORIZED")`
 * when `ctx.userId` is null. Call this at the top of any service that
 * requires an authenticated user.
 */
export function requireUserId(ctx: ServiceCtx): string {
  if (!ctx.userId) {
    throw new CoreError("UNAUTHORIZED");
  }
  return ctx.userId;
}
