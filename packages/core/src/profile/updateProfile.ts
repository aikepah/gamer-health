import type { z } from "zod/v4";

import { Profile, UpsertProfileSchema } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import type { ProfileRow } from "./getOrCreateProfile";
import { requireUserId } from "../lib/auth";
import { CoreError } from "../lib/errors";

export const updateProfileInput = UpsertProfileSchema;
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

/**
 * A timezone is valid if this runtime can resolve it. Deliberately NOT a
 * membership check against Intl.supportedValuesOf: the client dropdown is
 * built from the *browser's* list, and ICU/tzdata skew between browser and
 * server would otherwise reject options the UI itself offered (aliases and
 * newly added zones resolve fine even when absent from the canonical list).
 */
function isResolvableTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Upserts the caller's profile and returns the resulting row. */
export async function updateProfile(
  ctx: ServiceCtx,
  input: UpdateProfileInput,
): Promise<ProfileRow> {
  const userId = requireUserId(ctx);

  if (!isResolvableTimezone(input.timezone)) {
    throw new CoreError("BAD_REQUEST", `Unknown timezone: ${input.timezone}`);
  }

  const [row] = await ctx.db
    .insert(Profile)
    .values({ userId, ...input })
    .onConflictDoUpdate({
      target: Profile.userId,
      set: {
        timezone: input.timezone,
        platforms: input.platforms,
        goals: input.goals,
      },
    })
    .returning();

  if (!row) {
    throw new CoreError("NOT_FOUND", "Failed to upsert profile");
  }
  return row;
}
