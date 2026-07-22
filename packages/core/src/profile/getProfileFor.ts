import { eq } from "@gamer-health/db";
import { Profile } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import type { ProfileRow } from "./getOrCreateProfile";

/**
 * Reads `userId`'s profile, or `null` if none exists yet. Unlike
 * `getOrCreateProfile`, this never creates a row — it's for coach-scoped
 * reads (#12) that need a target player's timezone but must never have the
 * side effect of creating a profile for a user who isn't the caller.
 */
export async function getProfileFor(
  ctx: ServiceCtx,
  userId: string,
): Promise<ProfileRow | null> {
  const existing = await ctx.db.query.Profile.findFirst({
    where: eq(Profile.userId, userId),
  });
  return existing ?? null;
}
