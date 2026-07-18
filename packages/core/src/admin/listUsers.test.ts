import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import { listUsers } from "./listUsers";

interface Row {
  userId: string;
  name: string;
  email: string;
  role: "player" | "coach" | "admin" | null;
  deactivatedAt: Date | null;
  createdAt: Date;
}

function makeChain(result: unknown[]) {
  const chain: {
    from: () => typeof chain;
    leftJoin: () => typeof chain;
    where: () => typeof chain;
    orderBy: () => typeof chain;
    limit: () => typeof chain;
    offset: () => typeof chain;
    groupBy: () => typeof chain;
    then: (resolve: (v: unknown[]) => void) => void;
  } = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    groupBy: () => chain,
    then: (resolve) => resolve(result),
  };
  return chain;
}

function makeCtx(config: {
  actorId: string | null;
  actorProfile?: { role: "player" | "coach" | "admin"; deactivatedAt: null };
  rows?: Row[];
  total?: number;
  sessionAgg?: { userId: string; value: number; lastAt: Date | null }[];
  checkinAgg?: { userId: string; value: number; lastAt: Date | null }[];
}) {
  const findFirst = vi.fn().mockResolvedValue(config.actorProfile);

  const selectQueue = [
    makeChain(config.rows ?? []),
    makeChain([{ value: config.total ?? (config.rows?.length ?? 0) }]),
    makeChain(config.sessionAgg ?? []),
    makeChain(config.checkinAgg ?? []),
  ];
  const select = vi.fn(() => selectQueue.shift() ?? makeChain([]));

  const db = {
    query: { Profile: { findFirst } },
    select,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: config.actorId } as ServiceCtx, select };
}

describe("listUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx({ actorId: null });
    await expect(
      listUsers(ctx, { limit: 50, offset: 0 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws CoreError(FORBIDDEN) when the caller isn't an admin", async () => {
    const { ctx } = makeCtx({
      actorId: "user_1",
      actorProfile: { role: "player", deactivatedAt: null },
    });
    await expect(
      listUsers(ctx, { limit: 50, offset: 0 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns an empty list without querying aggregates when there are no rows", async () => {
    const { ctx, select } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      rows: [],
      total: 0,
    });

    const result = await listUsers(ctx, { limit: 50, offset: 0 });

    expect(result).toEqual({ total: 0, users: [] });
    // Only the rows + count queries — no session/checkin aggregate queries.
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("defaults a null role to 'player' and computes the greater of the two last-active timestamps", async () => {
    const sessionLast = new Date("2026-07-15T10:00:00Z");
    const checkinLast = new Date("2026-07-16T08:00:00Z");
    const { ctx } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      rows: [
        {
          userId: "user_1",
          name: "Riley Chen",
          email: "riley@x.dev",
          role: null,
          deactivatedAt: null,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      total: 1,
      sessionAgg: [{ userId: "user_1", value: 3, lastAt: sessionLast }],
      checkinAgg: [{ userId: "user_1", value: 5, lastAt: checkinLast }],
    });

    const result = await listUsers(ctx, { limit: 50, offset: 0 });

    expect(result.total).toBe(1);
    expect(result.users).toEqual([
      {
        userId: "user_1",
        name: "Riley Chen",
        email: "riley@x.dev",
        role: "player",
        deactivatedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        sessionCount: 3,
        checkinCount: 5,
        lastActiveAt: checkinLast,
      },
    ]);
  });

  it("is null lastActiveAt when neither sessions nor check-ins exist", async () => {
    const { ctx } = makeCtx({
      actorId: "admin_1",
      actorProfile: { role: "admin", deactivatedAt: null },
      rows: [
        {
          userId: "user_2",
          name: "Sam Okafor",
          email: "sam@x.dev",
          role: "coach",
          deactivatedAt: null,
          createdAt: new Date("2026-02-01T00:00:00Z"),
        },
      ],
      total: 1,
      sessionAgg: [],
      checkinAgg: [],
    });

    const result = await listUsers(ctx, { limit: 50, offset: 0 });

    expect(result.users[0]).toMatchObject({
      sessionCount: 0,
      checkinCount: 0,
      lastActiveAt: null,
    });
  });
});
