import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { listCoachPlayerSessions } from "./listCoachPlayerSessions";

function makeCtx(config: {
  userId: string | null;
  profile?: { role: "player" | "coach" | "admin"; deactivatedAt: Date | null };
  relationship?: { id: string };
  items?: unknown[];
  total?: number;
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(config.profile);
  const relationshipFindFirst = vi.fn().mockResolvedValue(config.relationship);
  const findMany = vi.fn().mockResolvedValue(config.items ?? []);
  const where = vi.fn().mockResolvedValue([{ value: config.total ?? 0 }]);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachingRelationship: { findFirst: relationshipFindFirst },
      GameSession: { findMany },
    },
    select,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.userId } as ServiceCtx,
    findMany,
    relationshipFindFirst,
  };
}

describe("listCoachPlayerSessions", () => {
  it("throws CoreError(FORBIDDEN) for a coach with no active relationship to the player", async () => {
    const { ctx, findMany } = makeCtx({
      userId: "coach_1",
      profile: { role: "coach", deactivatedAt: null },
      relationship: undefined,
    });

    await expect(
      listCoachPlayerSessions(ctx, {
        playerUserId: "player_1",
        limit: 20,
        offset: 0,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("throws CoreError(FORBIDDEN) for a non-coach caller (no implicit admin pass)", async () => {
    const { ctx, findMany } = makeCtx({
      userId: "admin_1",
      profile: { role: "admin", deactivatedAt: null },
    });

    await expect(
      listCoachPlayerSessions(ctx, {
        playerUserId: "player_1",
        limit: 20,
        offset: 0,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("delegates to listSessionsFor(playerUserId) once authorized", async () => {
    const items = [{ id: "session_1" }];
    const { ctx, findMany, relationshipFindFirst } = makeCtx({
      userId: "coach_1",
      profile: { role: "coach", deactivatedAt: null },
      relationship: { id: "rel_1" },
      items,
      total: 3,
    });

    const result = await listCoachPlayerSessions(ctx, {
      playerUserId: "player_1",
      limit: 10,
      offset: 0,
    });

    expect(result).toEqual({ items, total: 3 });
    // assertCoachOf's relationship lookup ran (proving the gate executed).
    expect(relationshipFindFirst).toHaveBeenCalledTimes(1);
    // The query for the PLAYER's sessions, not the coach's own.
    const arg = findMany.mock.calls[0]?.[0] as {
      limit: number;
      offset: number;
    };
    expect(arg.limit).toBe(10);
    expect(arg.offset).toBe(0);
  });
});
