import { and, eq, isNull } from "@gamer-health/db";
import { GameSession } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import type { GameRow } from "./games";
import type { GameSessionRow } from "./startSession";
import { requireUserId } from "../lib/auth";

/** Returns the caller's active (unended) session with its game, or null. */
export async function getActiveSession(
  ctx: ServiceCtx,
): Promise<(GameSessionRow & { game: GameRow }) | null> {
  const userId = requireUserId(ctx);

  const session = await ctx.db.query.GameSession.findFirst({
    where: and(eq(GameSession.userId, userId), isNull(GameSession.endedAt)),
    with: { game: true },
  });
  return session ?? null;
}
