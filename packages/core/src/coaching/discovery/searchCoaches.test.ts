import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { searchCoaches } from "./searchCoaches";

function makeChain(result: unknown[]) {
  const chain: {
    from: () => typeof chain;
    innerJoin: () => typeof chain;
    where: () => typeof chain;
    orderBy: () => typeof chain;
    limit: () => typeof chain;
    offset: () => typeof chain;
    then: (resolve: (v: unknown[]) => void) => void;
  } = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    then: (resolve) => resolve(result),
  };
  return chain;
}

interface Row {
  userId: string;
  name: string;
  headline: string | null;
  specialties: string[];
  acceptingApplications: boolean;
  timezone: string | null;
}

function makeCtx(config: {
  callerId?: string;
  callerProfile?: {
    role: "player" | "coach" | "admin";
    deactivatedAt: Date | null;
  };
  rows?: Row[];
  total?: number;
  extraSelectCalls?: number;
  gameRows?: { coachUserId: string; game: { id: string; name: string } }[];
  availabilityRows?: {
    coachUserId: string;
    weekday: number;
    startMinute: number;
    endMinute: number;
  }[];
  relationshipRows?: { coachUserId: string; id: string; status: string }[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue(config.callerProfile);
  const gameGameFindMany = vi.fn().mockResolvedValue(config.gameRows ?? []);
  const availabilityFindMany = vi
    .fn()
    .mockResolvedValue(config.availabilityRows ?? []);
  const relationshipFindMany = vi
    .fn()
    .mockResolvedValue(config.relationshipRows ?? []);

  const rowsChain = makeChain(config.rows ?? []);
  const countChain = makeChain([
    { value: config.total ?? config.rows?.length ?? 0 },
  ]);
  const extraChain = makeChain([]);

  const selectQueue = [
    ...Array<typeof extraChain>(config.extraSelectCalls ?? 0).fill(extraChain),
    rowsChain,
    countChain,
  ];
  const select = vi.fn(() => selectQueue.shift() ?? makeChain([]));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachGame: { findMany: gameGameFindMany },
      CoachAvailability: { findMany: availabilityFindMany },
      CoachingRelationship: { findMany: relationshipFindMany },
    },
    select,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "player_1" } as ServiceCtx,
    select,
    gameGameFindMany,
    availabilityFindMany,
    relationshipFindMany,
  };
}

describe("searchCoaches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx({ callerId: undefined });
    (ctx as { userId: string | null }).userId = null;
    await expect(
      searchCoaches(ctx, { limit: 20, offset: 0 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws CoreError(FORBIDDEN) when the caller is deactivated", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: new Date() },
    });
    await expect(
      searchCoaches(ctx, { limit: 20, offset: 0 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns an empty list without follow-up queries when there are no rows", async () => {
    const {
      ctx,
      gameGameFindMany,
      availabilityFindMany,
      relationshipFindMany,
    } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      rows: [],
      total: 0,
    });

    const result = await searchCoaches(ctx, { limit: 20, offset: 0 });

    expect(result).toEqual({ total: 0, coaches: [] });
    expect(gameGameFindMany).not.toHaveBeenCalled();
    expect(availabilityFindMany).not.toHaveBeenCalled();
    expect(relationshipFindMany).not.toHaveBeenCalled();
  });

  it("maps a null timezone to 'UTC' and assembles games/availability/myRelationship", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      rows: [
        {
          userId: "coach_1",
          name: "Dana Whitfield",
          headline: "Sleep coach",
          specialties: ["Sleep"],
          acceptingApplications: true,
          timezone: null,
        },
      ],
      total: 1,
      gameRows: [
        { coachUserId: "coach_1", game: { id: "game_1", name: "Fortnite" } },
      ],
      availabilityRows: [
        {
          coachUserId: "coach_1",
          weekday: 1,
          startMinute: 1020,
          endMinute: 1200,
        },
      ],
      relationshipRows: [
        { coachUserId: "coach_1", id: "rel_1", status: "applied" },
      ],
    });

    const result = await searchCoaches(ctx, { limit: 20, offset: 0 });

    expect(result.total).toBe(1);
    expect(result.coaches).toEqual([
      {
        userId: "coach_1",
        name: "Dana Whitfield",
        headline: "Sleep coach",
        specialties: ["Sleep"],
        acceptingApplications: true,
        games: [{ id: "game_1", name: "Fortnite" }],
        availability: [{ weekday: 1, startMinute: 1020, endMinute: 1200 }],
        timezone: "UTC",
        myRelationship: { id: "rel_1", status: "applied" },
      },
    ]);
  });

  it("returns myRelationship: null when the caller has no open row with that coach", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      rows: [
        {
          userId: "coach_1",
          name: "Demo Coach",
          headline: null,
          specialties: [],
          acceptingApplications: true,
          timezone: "America/Chicago",
        },
      ],
      total: 1,
    });

    const result = await searchCoaches(ctx, { limit: 20, offset: 0 });

    expect(result.coaches[0]).toMatchObject({
      timezone: "America/Chicago",
      myRelationship: null,
    });
  });

  it("does not throw when a gameId filter is supplied (builds an EXISTS subquery)", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      rows: [],
      total: 0,
      extraSelectCalls: 1,
    });

    await expect(
      searchCoaches(ctx, {
        limit: 20,
        offset: 0,
        gameId: "11111111-1111-1111-1111-111111111111",
      }),
    ).resolves.toEqual({ total: 0, coaches: [] });
  });

  it("does not throw when weekday + time-window filters are supplied", async () => {
    const { ctx } = makeCtx({
      callerProfile: { role: "player", deactivatedAt: null },
      rows: [],
      total: 0,
      extraSelectCalls: 1,
    });

    await expect(
      searchCoaches(ctx, {
        limit: 20,
        offset: 0,
        weekdays: [1, 3],
        fromMinute: 600,
        toMinute: 900,
      }),
    ).resolves.toEqual({ total: 0, coaches: [] });
  });
});
