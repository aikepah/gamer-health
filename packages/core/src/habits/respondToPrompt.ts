import { z } from "zod/v4";

import { and, eq } from "@gamer-health/db";
import { HabitPrompt } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { recordRewardEvent } from "../gamification/events";
import { requireUserId } from "../lib/auth";
import { CoreError } from "../lib/errors";

export const respondToPromptInput = z.object({
  promptId: z.uuid(),
  response: z.enum(["done", "skipped"]),
});
export type RespondToPromptInput = z.infer<typeof respondToPromptInput>;

export type HabitPromptRow = typeof HabitPrompt.$inferSelect;

/**
 * Marks a pending prompt done/skipped. Only transitions from status
 * "pending" (else `CoreError("CONFLICT")`). Emits `habit_prompt_completed`
 * when done.
 */
export async function respondToPrompt(
  ctx: ServiceCtx,
  input: RespondToPromptInput,
): Promise<HabitPromptRow> {
  const userId = requireUserId(ctx);

  const prompt = await ctx.db.query.HabitPrompt.findFirst({
    where: and(
      eq(HabitPrompt.id, input.promptId),
      eq(HabitPrompt.userId, userId),
    ),
    with: { habit: { with: { definition: true } } },
  });
  if (!prompt) {
    throw new CoreError("NOT_FOUND", "Prompt not found");
  }
  if (prompt.status !== "pending") {
    throw new CoreError("CONFLICT", "Prompt already responded to");
  }

  // Conditional on status so a concurrent response loses cleanly (CONFLICT)
  // instead of silently overwriting the first one.
  const [updated] = await ctx.db
    .update(HabitPrompt)
    .set({ status: input.response, respondedAt: new Date() })
    .where(
      and(eq(HabitPrompt.id, prompt.id), eq(HabitPrompt.status, "pending")),
    )
    .returning();
  if (!updated) {
    throw new CoreError("CONFLICT", "Prompt already responded to");
  }

  if (input.response === "done") {
    await recordRewardEvent(ctx, {
      eventType: "habit_prompt_completed",
      sourceId: updated.id,
      meta: {
        habitKind: prompt.habit.definition.slug ?? null,
        definitionId: prompt.habit.definitionId,
      },
    });
  }

  return updated;
}
