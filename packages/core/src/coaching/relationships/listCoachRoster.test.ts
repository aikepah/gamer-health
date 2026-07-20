import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { listCoachRoster } from "./listCoachRoster";

function makeChain(result: unknown[]) {
  const chain: {
    from: () => typeof chain;
    innerJoin: () => typeof chain;
    where: () => typeof chain;
    orderBy: (..._args: unknown[]) => Promise<unknown[]>;
  } = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(result),
  };
  return chain;
}

function makeCtx(config: {
  authzProfile?: {
    role: "player" | "coach" | "admin";
    deactivatedAt: Date | null;
  };
  rows?: {
    relationshipId: string;
    status: string;
    playerUserId: string;
    playerName: string;
    playerEmail: string;
    message: string | null;
    appliedAt: Date;
    startedAt: Date | null;
  }[];
}) {
  const select = vi.fn(() => makeChain(config.rows ?? []));
  const profileFindFirst = vi
    .fn()
    .mockResolvedValue(
      config.authzProfile ?? { role: "coach", deactivatedAt: null },
    );
  const db = {
    select,
    query: { Profile: { findFirst: profileFindFirst } },
  } as unknown as ServiceCtx["db"];
  return { ctx: { db, userId: "coach_1" } as ServiceCtx };
}

describe("listCoachRoster", () => {
  it("throws CoreError(FORBIDDEN) for a non-coach", async () => {
    const { ctx } = makeCtx({
      authzProfile: { role: "player", deactivatedAt: null },
    });
    await expect(
      listCoachRoster(ctx, { status: "active" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps rows into the RosterEntry shape", async () => {
    const startedAt = new Date("2026-06-20T00:00:00Z");
    const { ctx } = makeCtx({
      rows: [
        {
          relationshipId: "rel_1",
          status: "active",
          playerUserId: "player_1",
          playerName: "Riley Chen",
          playerEmail: "player1@gamerhealth.dev",
          message: "Hi coach",
          appliedAt: new Date("2026-06-15T00:00:00Z"),
          startedAt,
        },
      ],
    });

    const result = await listCoachRoster(ctx, { status: "active" });

    expect(result).toEqual([
      {
        relationshipId: "rel_1",
        status: "active",
        player: {
          userId: "player_1",
          name: "Riley Chen",
          email: "player1@gamerhealth.dev",
        },
        message: "Hi coach",
        appliedAt: new Date("2026-06-15T00:00:00Z"),
        startedAt,
      },
    ]);
  });

  it("defaults input.status to 'active'", async () => {
    const { ctx } = makeCtx({ rows: [] });
    const result = await listCoachRoster(ctx, { status: "active" });
    expect(result).toEqual([]);
  });
});
