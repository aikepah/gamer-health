import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { getSchedulingContext } from "./getSchedulingContext";

interface RelationshipRow {
  id: string;
  playerUserId: string;
  coachUserId: string;
  status: string;
}

const REL: RelationshipRow = {
  id: "rel_1",
  playerUserId: "player_1",
  coachUserId: "coach_1",
  status: "active",
};

function makeCtx(config: {
  callerId?: string;
  rel?: RelationshipRow | undefined;
  coachTimezone?: string | null;
  blocks?: { id: string; weekday: number; startMinute: number; endMinute: number }[];
  coachName?: string;
  busy?: { startsAt: Date; endsAt: Date }[];
}) {
  const playerProfile = { role: "player", deactivatedAt: null };
  const coachProfile = {
    role: "coach",
    deactivatedAt: null,
    timezone: "coachTimezone" in config ? config.coachTimezone : "America/Chicago",
  };

  const profileFindFirst = vi
    .fn()
    .mockResolvedValueOnce(playerProfile) // requireMyCoachRelationship's requireActiveUser
    .mockResolvedValueOnce(playerProfile) // getCoachAvailability's requireActiveUser
    .mockResolvedValueOnce(coachProfile); // getCoachAvailability's coach lookup

  const relationshipFindFirst = vi
    .fn()
    .mockResolvedValue("rel" in config ? config.rel : REL);
  const coachProfileFindFirst = vi
    .fn()
    .mockResolvedValue({ isPublished: true });
  const availabilityFindMany = vi.fn().mockResolvedValue(config.blocks ?? []);
  const userFindFirst = vi
    .fn()
    .mockResolvedValue({ name: config.coachName ?? "Demo Coach" });
  const sessionFindMany = vi.fn().mockResolvedValue(config.busy ?? []);

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachingRelationship: { findFirst: relationshipFindFirst },
      CoachProfile: { findFirst: coachProfileFindFirst },
      CoachAvailability: { findMany: availabilityFindMany },
      user: { findFirst: userFindFirst },
      CoachingSession: { findMany: sessionFindMany },
    },
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId: config.callerId ?? "player_1" } as ServiceCtx };
}

describe("getSchedulingContext", () => {
  it("throws FORBIDDEN when the caller has no active coach", async () => {
    const { ctx } = makeCtx({ rel: undefined });
    await expect(getSchedulingContext(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws BAD_REQUEST when the coach has no timezone set", async () => {
    const { ctx } = makeCtx({ coachTimezone: null });
    await expect(getSchedulingContext(ctx)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("returns the coach's availability, timezone, and busy confirmed sessions", async () => {
    const busy = [
      { startsAt: new Date("2026-08-01T22:00:00Z"), endsAt: new Date("2026-08-01T23:00:00Z") },
    ];
    const { ctx } = makeCtx({
      blocks: [{ id: "b1", weekday: 3, startMinute: 1020, endMinute: 1200 }],
      busy,
    });

    const result = await getSchedulingContext(ctx);

    expect(result.coach).toEqual({
      userId: "coach_1",
      name: "Demo Coach",
      timezone: "America/Chicago",
    });
    expect(result.availability).toHaveLength(1);
    expect(result.busy).toEqual(busy);
  });
});
