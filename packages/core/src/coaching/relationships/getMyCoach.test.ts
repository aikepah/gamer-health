import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { getMyCoach } from "./getMyCoach";

function makeChain(result: unknown[]) {
  const chain: {
    from: () => typeof chain;
    innerJoin: () => typeof chain;
    leftJoin: () => typeof chain;
    where: () => typeof chain;
    limit: (..._args: unknown[]) => Promise<unknown[]>;
  } = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(result),
  };
  return chain;
}

function makeCtx(config: {
  rows?: {
    relationshipId: string;
    startedAt: Date | null;
    coachUserId: string;
    coachName: string;
    coachHeadline: string | null;
    coachSpecialties: string[] | null;
  }[];
}) {
  const select = vi.fn(() => makeChain(config.rows ?? []));
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue({ role: "player", deactivatedAt: null });
  const db = {
    select,
    query: { Profile: { findFirst: profileFindFirst } },
  } as unknown as ServiceCtx["db"];
  return { ctx: { db, userId: "player_1" } as ServiceCtx };
}

describe("getMyCoach", () => {
  it("returns null (not an error) when the player has no active coach", async () => {
    const { ctx } = makeCtx({ rows: [] });
    await expect(getMyCoach(ctx)).resolves.toBeNull();
  });

  it("maps the row into the MyCoachSummary shape", async () => {
    const startedAt = new Date("2026-06-20T00:00:00Z");
    const { ctx } = makeCtx({
      rows: [
        {
          relationshipId: "rel_1",
          startedAt,
          coachUserId: "coach_1",
          coachName: "Demo Coach",
          coachHeadline: "Sleep coach",
          coachSpecialties: ["Sleep", "Focus & Attention"],
        },
      ],
    });

    const result = await getMyCoach(ctx);

    expect(result).toEqual({
      relationshipId: "rel_1",
      startedAt,
      coach: {
        userId: "coach_1",
        name: "Demo Coach",
        headline: "Sleep coach",
        specialties: ["Sleep", "Focus & Attention"],
      },
    });
  });

  it("defaults a null headline/specialties to null/[]", async () => {
    const { ctx } = makeCtx({
      rows: [
        {
          relationshipId: "rel_1",
          startedAt: null,
          coachUserId: "coach_1",
          coachName: "Demo Coach",
          coachHeadline: null,
          coachSpecialties: null,
        },
      ],
    });

    const result = await getMyCoach(ctx);
    expect(result?.coach.headline).toBeNull();
    expect(result?.coach.specialties).toEqual([]);
  });
});
