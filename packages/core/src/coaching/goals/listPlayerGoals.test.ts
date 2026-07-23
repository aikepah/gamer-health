import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { listPlayerGoals } from "./listPlayerGoals";

function makeCtx(config: {
  callerId?: string;
  callerRole?: "player" | "coach" | "admin";
  relationship?: { id: string } | undefined;
  playerTimezone?: string | null;
  rows?: unknown[];
}) {
  const profileFindFirst = vi
    .fn()
    .mockResolvedValueOnce({
      role: config.callerRole ?? "coach",
      deactivatedAt: null,
    })
    .mockResolvedValueOnce({ timezone: config.playerTimezone ?? null });
  const relationshipFindFirst = vi.fn().mockResolvedValue(config.relationship);

  const orderBy = vi.fn().mockResolvedValue(config.rows ?? []);
  const where = vi.fn(() => ({ orderBy }));
  const leftJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ leftJoin }));
  const select = vi.fn(() => ({ from }));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachingRelationship: { findFirst: relationshipFindFirst },
    },
    select,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: config.callerId ?? "coach_1" } as ServiceCtx };
}

describe("listPlayerGoals", () => {
  it("throws CoreError(FORBIDDEN) when the caller has no active relationship to this player", async () => {
    const { ctx } = makeCtx({ relationship: undefined });
    await expect(
      listPlayerGoals(ctx, { playerUserId: "player_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CoreError(FORBIDDEN) when the caller isn't a coach at all", async () => {
    const { ctx } = makeCtx({ callerRole: "player" });
    await expect(
      listPlayerGoals(ctx, { playerUserId: "player_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("computes overdue against the PLAYER's timezone, not the coach's", async () => {
    const { ctx } = makeCtx({
      relationship: { id: "rel_1" },
      playerTimezone: "UTC",
      rows: [
        {
          id: "goal_1",
          playerUserId: "player_1",
          assignedByUserId: "coach_1",
          relationshipId: "rel_1",
          title: "Sleep by 11pm",
          description: null,
          targetDate: "2000-01-01",
          status: "open",
          progressNote: null,
          closedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          assignedByName: "Demo Coach",
        },
      ],
    });

    const [goal] = await listPlayerGoals(ctx, { playerUserId: "player_1" });
    expect(goal?.overdue).toBe(true);
  });
});
