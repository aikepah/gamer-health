import { z } from "zod/v4";

import { asc, eq } from "@gamer-health/db";
import { CoachAvailability } from "@gamer-health/db/schema";

import type { ServiceCtx, TxDb } from "../../ctx";
import type { AvailabilityBlock } from "./getOrCreateCoachProfile";
import { requireRole } from "../../authz/requireRole";
import { CoreError } from "../../lib/errors";
import { ensureCoachProfileRow } from "./getOrCreateCoachProfile";

export const availabilityBlockInput = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});
export type AvailabilityBlockInput = z.infer<typeof availabilityBlockInput>;

export const setCoachAvailabilityInput = z.object({
  blocks: z.array(availabilityBlockInput).max(40),
});
export type SetCoachAvailabilityInput = z.infer<
  typeof setCoachAvailabilityInput
>;

/**
 * Validates the whole proposed block set BEFORE any write: every block must
 * end after it starts, and no two blocks on the same weekday may overlap
 * (checked by sorting each weekday's blocks and comparing neighbours — this
 * also catches exact duplicates, since a duplicate's start is always < the
 * previous block's end).
 */
function validateBlocks(blocks: AvailabilityBlockInput[]): void {
  for (const block of blocks) {
    if (block.endMinute <= block.startMinute) {
      throw new CoreError("BAD_REQUEST", "Block must end after it starts");
    }
  }

  const byWeekday = new Map<number, AvailabilityBlockInput[]>();
  for (const block of blocks) {
    const existing = byWeekday.get(block.weekday) ?? [];
    existing.push(block);
    byWeekday.set(block.weekday, existing);
  }

  for (const dayBlocks of byWeekday.values()) {
    const sorted = [...dayBlocks].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev && curr && curr.startMinute < prev.endMinute) {
        throw new CoreError("BAD_REQUEST", "Availability blocks overlap");
      }
    }
  }
}

/**
 * Replace-set: the caller's weekly availability becomes exactly `blocks`
 * (delete all, then insert), in one transaction. Availability is small and
 * always edited as a whole.
 */
export async function setCoachAvailability(
  ctx: ServiceCtx,
  input: SetCoachAvailabilityInput,
): Promise<AvailabilityBlock[]> {
  const authz = await requireRole(ctx, ["coach"]);
  await ensureCoachProfileRow(ctx, authz.userId);
  validateBlocks(input.blocks);

  return ctx.db.transaction(async (tx: TxDb) => {
    await tx
      .delete(CoachAvailability)
      .where(eq(CoachAvailability.coachUserId, authz.userId));

    if (input.blocks.length > 0) {
      await tx.insert(CoachAvailability).values(
        input.blocks.map((block) => ({
          coachUserId: authz.userId,
          weekday: block.weekday,
          startMinute: block.startMinute,
          endMinute: block.endMinute,
        })),
      );
    }

    const rows = await tx.query.CoachAvailability.findMany({
      where: eq(CoachAvailability.coachUserId, authz.userId),
      orderBy: [
        asc(CoachAvailability.weekday),
        asc(CoachAvailability.startMinute),
      ],
    });
    return rows.map((row) => ({
      id: row.id,
      weekday: row.weekday,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
    }));
  });
}
