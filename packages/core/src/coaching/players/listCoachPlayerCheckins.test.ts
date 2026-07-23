import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { listCoachPlayerCheckins } from "./listCoachPlayerCheckins";

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
      Checkin: { findMany },
    },
    select,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.userId } as ServiceCtx,
    findMany,
    relationshipFindFirst,
  };
}

describe("listCoachPlayerCheckins", () => {
  it("throws CoreError(FORBIDDEN) for a coach with no active relationship to the player", async () => {
    const { ctx, findMany } = makeCtx({
      userId: "coach_1",
      profile: { role: "coach", deactivatedAt: null },
      relationship: undefined,
    });

    await expect(
      listCoachPlayerCheckins(ctx, {
        playerUserId: "player_1",
        limit: 30,
        offset: 0,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("delegates to listCheckinsFor(playerUserId) once authorized, including notes", async () => {
    const items = [{ id: "checkin_1", note: "Felt great after the session" }];
    const { ctx, findMany, relationshipFindFirst } = makeCtx({
      userId: "coach_1",
      profile: { role: "coach", deactivatedAt: null },
      relationship: { id: "rel_1" },
      items,
      total: 1,
    });

    const result = await listCoachPlayerCheckins(ctx, {
      playerUserId: "player_1",
      limit: 30,
      offset: 0,
    });

    expect(result).toEqual({ items, total: 1 });
    expect(relationshipFindFirst).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0]?.[0] as {
      limit: number;
      offset: number;
    };
    expect(arg.limit).toBe(30);
    expect(arg.offset).toBe(0);
  });
});
