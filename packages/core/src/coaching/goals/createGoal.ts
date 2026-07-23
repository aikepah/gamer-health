import { z } from "zod/v4";

import { and, eq, sql } from "@gamer-health/db";
import { Goal } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import type { GoalRow } from "./common";
import { assertCoachOf } from "../../authz/assertCoachOf";
import { requireUserId } from "../../lib/auth";
import { CoreError } from "../../lib/errors";
import { findActiveRelationship } from "../relationships/getActiveRelationship";
import { dateStringOrNull, nullableText } from "./common";

const MAX_OPEN_GOALS_PER_PLAYER = 50;

export const createGoalInput = z.object({
  playerUserId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  description: nullableText(2000),
  targetDate: dateStringOrNull(),
});
export type CreateGoalInput = z.infer<typeof createGoalInput>;

/**
 * Coach-assigns a goal to a roster player (#13). `assertCoachOf` is the
 * privacy/authorization gate — a coach can only create goals for their own
 * ACTIVE player. `relationshipId` stamps provenance from that same active
 * relationship so the goal survives it ending later.
 *
 * Cap: a player may have at most 50 OPEN goals at once — a cheap guard
 * against a runaway UI, not a product decision. Beyond that, CONFLICT.
 */
export async function createGoal(
  ctx: ServiceCtx,
  input: CreateGoalInput,
): Promise<GoalRow> {
  await assertCoachOf(ctx, input.playerUserId);
  const coachUserId = requireUserId(ctx);

  const relationship = await findActiveRelationship(
    ctx,
    input.playerUserId,
    coachUserId,
  );

  const [openCountRow] = await ctx.db
    .select({ count: sql<string>`count(*)` })
    .from(Goal)
    .where(
      and(eq(Goal.playerUserId, input.playerUserId), eq(Goal.status, "open")),
    );
  if (Number(openCountRow?.count ?? 0) >= MAX_OPEN_GOALS_PER_PLAYER) {
    throw new CoreError(
      "CONFLICT",
      "This player already has the maximum number of open goals",
    );
  }

  const [inserted] = await ctx.db
    .insert(Goal)
    .values({
      playerUserId: input.playerUserId,
      assignedByUserId: coachUserId,
      relationshipId: relationship?.id ?? null,
      title: input.title,
      description: input.description,
      targetDate: input.targetDate,
      status: "open",
    })
    .returning();
  if (!inserted) {
    throw new CoreError("CONFLICT", "Failed to create goal");
  }
  return inserted;
}
