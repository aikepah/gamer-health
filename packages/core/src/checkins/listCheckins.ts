import { z } from "zod/v4";

import { count, desc, eq } from "@gamer-health/db";
import { Checkin } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import type { GameRow } from "../sessions/games";
import type { GameSessionRow } from "../sessions/startSession";
import type { CheckinRow } from "./dailyGuard";
import { requireUserId } from "../lib/auth";

export const listCheckinsInput = z.object({
  limit: z.number().int().min(1).max(100).default(30),
  offset: z.number().int().min(0).default(0),
});
export type ListCheckinsInput = z.infer<typeof listCheckinsInput>;

export interface ListCheckinsResult {
  items: (CheckinRow & {
    session: (GameSessionRow & { game: GameRow }) | null;
  })[];
  total: number;
}

/** Lists the caller's check-ins, newest first. */
export async function listCheckins(
  ctx: ServiceCtx,
  input: ListCheckinsInput,
): Promise<ListCheckinsResult> {
  const userId = requireUserId(ctx);
  const where = eq(Checkin.userId, userId);

  const [items, totalRows] = await Promise.all([
    ctx.db.query.Checkin.findMany({
      where,
      orderBy: desc(Checkin.createdAt),
      limit: input.limit,
      offset: input.offset,
      with: { session: { with: { game: true } } },
    }),
    ctx.db.select({ value: count() }).from(Checkin).where(where),
  ]);

  return {
    items,
    total: totalRows[0]?.value ?? 0,
  };
}
