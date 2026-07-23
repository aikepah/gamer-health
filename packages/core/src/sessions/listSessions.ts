import { z } from "zod/v4";

import { and, count, desc, eq, gte, lte } from "@gamer-health/db";
import { GameSession } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import type { GameRow } from "./games";
import type { GameSessionRow } from "./startSession";
import { requireUserId } from "../lib/auth";

export const listSessionsInput = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});
export type ListSessionsInput = z.infer<typeof listSessionsInput>;

export interface ListSessionsResult {
  items: (GameSessionRow & { game: GameRow })[];
  total: number;
}

/**
 * Lists `userId`'s sessions, newest first, optionally filtered by date range.
 * Explicit-user inner function — callers that have already authorized a
 * specific target user (e.g. coach-scoped reads via `assertCoachOf`) call
 * this directly; `listSessions` below is the caller's-own-data wrapper.
 */
export async function listSessionsFor(
  ctx: ServiceCtx,
  userId: string,
  input: ListSessionsInput,
): Promise<ListSessionsResult> {
  const conditions = [eq(GameSession.userId, userId)];
  if (input.from) {
    conditions.push(gte(GameSession.startedAt, input.from));
  }
  if (input.to) {
    conditions.push(lte(GameSession.startedAt, input.to));
  }
  const where = and(...conditions);

  const [items, totalRows] = await Promise.all([
    ctx.db.query.GameSession.findMany({
      where,
      orderBy: desc(GameSession.startedAt),
      limit: input.limit,
      offset: input.offset,
      with: { game: true },
    }),
    ctx.db.select({ value: count() }).from(GameSession).where(where),
  ]);

  return {
    items,
    total: totalRows[0]?.value ?? 0,
  };
}

/** Lists the caller's sessions, newest first, optionally filtered by date range. */
export async function listSessions(
  ctx: ServiceCtx,
  input: ListSessionsInput,
): Promise<ListSessionsResult> {
  return listSessionsFor(ctx, requireUserId(ctx), input);
}
