import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { listMyApplications } from "./listMyApplications";

function makeChain(result: unknown[]) {
  const chain: {
    from: () => typeof chain;
    innerJoin: () => typeof chain;
    leftJoin: () => typeof chain;
    where: () => typeof chain;
    orderBy: (..._args: unknown[]) => Promise<unknown[]>;
  } = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(result),
  };
  return chain;
}

function makeCtx(config: {
  callerId?: string;
  rows?: {
    relationshipId: string;
    status: string;
    appliedAt: Date;
    respondedAt: Date | null;
    responseNote: string | null;
    coachUserId: string;
    coachName: string;
    coachHeadline: string | null;
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
  return { ctx: { db, userId: config.callerId ?? "player_1" } as ServiceCtx };
}

describe("listMyApplications", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx({});
    (ctx as { userId: string | null }).userId = null;
    await expect(listMyApplications(ctx)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("maps rows into the MyApplicationRow shape", async () => {
    const appliedAt = new Date("2026-07-18T10:00:00Z");
    const { ctx } = makeCtx({
      rows: [
        {
          relationshipId: "rel_1",
          status: "applied",
          appliedAt,
          respondedAt: null,
          responseNote: null,
          coachUserId: "coach_1",
          coachName: "Demo Coach",
          coachHeadline: "Sleep coach",
        },
      ],
    });

    const result = await listMyApplications(ctx);

    expect(result).toEqual([
      {
        relationshipId: "rel_1",
        status: "applied",
        appliedAt,
        respondedAt: null,
        responseNote: null,
        coach: {
          userId: "coach_1",
          name: "Demo Coach",
          headline: "Sleep coach",
        },
      },
    ]);
  });

  it("defaults a null coach headline to null explicitly", async () => {
    const { ctx } = makeCtx({
      rows: [
        {
          relationshipId: "rel_2",
          status: "declined",
          appliedAt: new Date(),
          respondedAt: new Date(),
          responseNote: "Not a good fit",
          coachUserId: "coach_2",
          coachName: "Coach Two",
          coachHeadline: null,
        },
      ],
    });

    const result = await listMyApplications(ctx);
    expect(result[0]?.coach.headline).toBeNull();
  });
});
