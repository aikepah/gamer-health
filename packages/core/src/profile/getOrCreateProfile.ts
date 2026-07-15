import { eq } from "@gamer-health/db";
import { Profile } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { requireUserId } from "../lib/auth";
import { CoreError } from "../lib/errors";

export type ProfileRow = typeof Profile.$inferSelect;

/**
 * Returns the caller's profile, creating one with defaults
 * (`timezone: null` = not chosen yet, `platforms: []`, `goals: null`)
 * if it doesn't exist yet.
 */
export async function getOrCreateProfile(ctx: ServiceCtx): Promise<ProfileRow> {
  const userId = requireUserId(ctx);

  const existing = await ctx.db.query.Profile.findFirst({
    where: eq(Profile.userId, userId),
  });
  if (existing) {
    return existing;
  }

  const [inserted] = await ctx.db
    .insert(Profile)
    .values({ userId, timezone: null, platforms: [], goals: null })
    .onConflictDoNothing()
    .returning();
  if (inserted) {
    return inserted;
  }

  // returning() is empty only when a concurrent request created the row
  // between our select and insert — fetch what it wrote.
  const created = await ctx.db.query.Profile.findFirst({
    where: eq(Profile.userId, userId),
  });
  if (!created) {
    throw new CoreError("NOT_FOUND", "Failed to create profile");
  }
  return created;
}
