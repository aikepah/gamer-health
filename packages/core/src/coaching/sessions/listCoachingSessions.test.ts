import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { listCoachingSessions } from "./listCoachingSessions";

function makeCtx(config: { callerId?: string; rows?: unknown[] }) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue({ role: "player", deactivatedAt: null });
  const findMany = vi.fn().mockResolvedValue(config.rows ?? []);

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachingSession: { findMany },
    },
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "player_1" } as ServiceCtx,
    findMany,
  };
}

describe("listCoachingSessions", () => {
  it("shapes rows into player/coach summaries", async () => {
    const { ctx } = makeCtx({
      rows: [
        {
          id: "session_1",
          playerUserId: "player_1",
          coachUserId: "coach_1",
          status: "proposed",
          player: { id: "player_1", name: "Riley Chen" },
          coach: { id: "coach_1", name: "Demo Coach" },
        },
      ],
    });

    const result = await listCoachingSessions(ctx, {
      scope: "upcoming",
      limit: 50,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.player).toEqual({
      userId: "player_1",
      name: "Riley Chen",
    });
    expect(result[0]?.coach).toEqual({ userId: "coach_1", name: "Demo Coach" });
  });

  it("passes scope defaults through and returns an empty list when there are no rows", async () => {
    const { ctx, findMany } = makeCtx({ rows: [] });
    const result = await listCoachingSessions(ctx, {
      scope: "upcoming",
      limit: 50,
    });
    expect(result).toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
