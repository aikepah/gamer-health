import { z } from "zod/v4";

import { eq } from "@gamer-health/db";
import { Profile } from "@gamer-health/db/schema";
import { GOAL_STATUSES } from "@gamer-health/validators";

import type { ServiceCtx } from "../../ctx";
import type { GoalListItem } from "./common";
import { assertCoachOf } from "../../authz/assertCoachOf";
import { queryGoalsForPlayer } from "./common";

export const listPlayerGoalsInput = z.object({
  playerUserId: z.string().min(1),
  status: z.enum(GOAL_STATUSES).optional(),
});
export type ListPlayerGoalsInput = z.infer<typeof listPlayerGoalsInput>;

/**
 * A coach's view of one roster player's goals (#13, the Goals panel on
 * `/coach/players/[playerUserId]`). `assertCoachOf` gates it exactly like
 * every other coach-side read of player data. `overdue` is computed against
 * the PLAYER's timezone (not the coach's) — falls back to UTC if the
 * player hasn't set one, same as `listMyGoals`.
 */
export async function listPlayerGoals(
  ctx: ServiceCtx,
  input: ListPlayerGoalsInput,
): Promise<GoalListItem[]> {
  await assertCoachOf(ctx, input.playerUserId);

  const playerProfile = await ctx.db.query.Profile.findFirst({
    where: eq(Profile.userId, input.playerUserId),
    columns: { timezone: true },
  });
  const timeZone = playerProfile?.timezone ?? "UTC";

  return queryGoalsForPlayer(ctx, input.playerUserId, input.status, timeZone);
}
