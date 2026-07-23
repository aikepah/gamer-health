import { z } from "zod/v4";

import { GOAL_STATUSES } from "@gamer-health/validators";

import type { ServiceCtx } from "../../ctx";
import type { GoalListItem } from "./common";
import { requireActiveUser } from "../../authz/requireRole";
import { getOrCreateProfile } from "../../profile/getOrCreateProfile";
import { queryGoalsForPlayer } from "./common";

export const listMyGoalsInput = z.object({
  status: z.enum(GOAL_STATUSES).optional(),
});
export type ListMyGoalsInput = z.infer<typeof listMyGoalsInput>;

/**
 * The caller's own goals (#13, `/goals`). `overdue` is computed against the
 * caller's own profile timezone (defaulting to UTC if they haven't set one
 * yet), same fallback the dashboard uses.
 */
export async function listMyGoals(
  ctx: ServiceCtx,
  input: ListMyGoalsInput,
): Promise<GoalListItem[]> {
  const authz = await requireActiveUser(ctx);
  const profile = await getOrCreateProfile(ctx);
  const timeZone = profile.timezone ?? "UTC";

  return queryGoalsForPlayer(ctx, authz.userId, input.status, timeZone);
}
