import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import {
  MAX_OUTSTANDING_PROPOSALS,
  proposeCoachingSession,
} from "./proposeCoachingSession";

interface ProfileLite {
  role: "player" | "coach" | "admin";
  deactivatedAt: Date | null;
  timezone?: string | null;
}

interface RelationshipRow {
  id: string;
  playerUserId: string;
  coachUserId: string;
  status: string;
}

interface Block {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}

const REL: RelationshipRow = {
  id: "rel_1",
  playerUserId: "player_1",
  coachUserId: "coach_1",
  status: "active",
};

const WED_EVENING: Block = {
  id: "b1",
  weekday: 3,
  startMinute: 1020,
  endMinute: 1200,
}; // Wed 17:00-20:00

/** Next Wednesday 17:30 UTC-... in America/Chicago, expressed directly in UTC for determinism. */
function nextWednesdayEvening(): { startsAt: Date; endsAt: Date } {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilWed = (3 - day + 7) % 7 || 7; // always strictly in the future
  const target = new Date(now);
  target.setUTCDate(now.getUTCDate() + daysUntilWed);
  // 17:30 America/Chicago is 22:30 UTC during CDT (UTC-5) — close enough for
  // a deterministic unit test; DST edge cases are covered by availability.test.ts.
  target.setUTCHours(22, 30, 0, 0);
  const startsAt = target;
  const endsAt = new Date(target.getTime() + 60 * 60 * 1000);
  return { startsAt, endsAt };
}

function makeCtx(config: {
  callerId?: string;
  rel?: RelationshipRow | undefined;
  playerProfile?: ProfileLite;
  coachProfile?: ProfileLite;
  coachIsPublished?: boolean;
  blocks?: Block[];
  overlapping?: { id: string } | undefined;
  outstandingCount?: number;
  insertedRow?: Record<string, unknown> | undefined;
}) {
  const playerProfile = config.playerProfile ?? {
    role: "player",
    deactivatedAt: null,
  };
  const coachProfile = config.coachProfile ?? {
    role: "coach",
    deactivatedAt: null,
    timezone: "America/Chicago",
  };

  // Call order: requireMyCoachRelationship's getAuthz -> player profile;
  // getCoachAvailability's requireActiveUser -> player profile again;
  // getCoachAvailability's own coach-profile lookup -> coach profile.
  const profileFindFirst = vi
    .fn()
    .mockResolvedValueOnce(playerProfile)
    .mockResolvedValueOnce(playerProfile)
    .mockResolvedValueOnce(coachProfile);

  const relationshipFindFirst = vi
    .fn()
    .mockResolvedValue("rel" in config ? config.rel : REL);
  const coachProfileFindFirst = vi
    .fn()
    .mockResolvedValue({ isPublished: config.coachIsPublished ?? true });
  const availabilityFindMany = vi
    .fn()
    .mockResolvedValue(config.blocks ?? [WED_EVENING]);

  const txCoachingSessionFindFirst = vi
    .fn()
    .mockResolvedValue(config.overlapping);

  const selectWhere = vi
    .fn()
    .mockResolvedValue([{ value: config.outstandingCount ?? 0 }]);
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  // REL is spread FIRST so the explicit `id` wins: spreading it last silently
  // gave the inserted session the relationship's id ("rel_1").
  const insertedRow = config.insertedRow ?? {
    ...REL,
    id: "session_1",
    status: "proposed",
  };
  const insertReturning = vi.fn().mockResolvedValue([insertedRow]);
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const tx = {
    query: { CoachingSession: { findFirst: txCoachingSessionFindFirst } },
    select,
    insert,
  };
  const transaction = vi.fn((cb: (tx: unknown) => unknown) => cb(tx));

  const db = {
    query: {
      Profile: { findFirst: profileFindFirst },
      CoachingRelationship: { findFirst: relationshipFindFirst },
      CoachProfile: { findFirst: coachProfileFindFirst },
      CoachAvailability: { findMany: availabilityFindMany },
    },
    transaction,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "player_1" } as ServiceCtx,
    insertValues,
    selectWhere,
  };
}

describe("proposeCoachingSession", () => {
  it("throws CoreError(FORBIDDEN) when the caller has no active coach", async () => {
    const { ctx } = makeCtx({ rel: undefined });
    const { startsAt, endsAt } = nextWednesdayEvening();
    await expect(
      proposeCoachingSession(ctx, { startsAt, endsAt }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws BAD_REQUEST for a session shorter than 15 minutes", async () => {
    const { ctx } = makeCtx({});
    const { startsAt } = nextWednesdayEvening();
    const endsAt = new Date(startsAt.getTime() + 10 * 60 * 1000);
    await expect(
      proposeCoachingSession(ctx, { startsAt, endsAt }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST for a session longer than 240 minutes", async () => {
    const { ctx } = makeCtx({});
    const { startsAt } = nextWednesdayEvening();
    const endsAt = new Date(startsAt.getTime() + 300 * 60 * 1000);
    await expect(
      proposeCoachingSession(ctx, { startsAt, endsAt }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST when startsAt is in the past", async () => {
    const { ctx } = makeCtx({});
    const startsAt = new Date(Date.now() - 60 * 60 * 1000);
    const endsAt = new Date(Date.now() + 60 * 1000);
    await expect(
      proposeCoachingSession(ctx, { startsAt, endsAt }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "That time has already passed",
    });
  });

  it("throws BAD_REQUEST when startsAt is more than 90 days out", async () => {
    const { ctx } = makeCtx({});
    const startsAt = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    await expect(
      proposeCoachingSession(ctx, { startsAt, endsAt }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "You can only schedule up to 90 days out",
    });
  });

  it("throws BAD_REQUEST when the coach has no timezone set", async () => {
    const { ctx } = makeCtx({
      coachProfile: { role: "coach", deactivatedAt: null, timezone: null },
    });
    const { startsAt, endsAt } = nextWednesdayEvening();
    await expect(
      proposeCoachingSession(ctx, { startsAt, endsAt }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Your coach hasn't set an availability timezone yet",
    });
  });

  it("throws BAD_REQUEST when the slot is outside the coach's availability", async () => {
    const { ctx } = makeCtx({ blocks: [] });
    const { startsAt, endsAt } = nextWednesdayEvening();
    await expect(
      proposeCoachingSession(ctx, { startsAt, endsAt }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "That time is outside your coach's availability",
    });
  });

  it("throws CONFLICT when the slot overlaps a confirmed session", async () => {
    const { ctx } = makeCtx({ overlapping: { id: "session_existing" } });
    const { startsAt, endsAt } = nextWednesdayEvening();
    await expect(
      proposeCoachingSession(ctx, { startsAt, endsAt }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Your coach is already booked then",
    });
  });

  it("throws CONFLICT when the player already has 5 outstanding proposals", async () => {
    const { ctx } = makeCtx({ outstandingCount: MAX_OUTSTANDING_PROPOSALS });
    const { startsAt, endsAt } = nextWednesdayEvening();
    await expect(
      proposeCoachingSession(ctx, { startsAt, endsAt }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("inserts a proposed session with the relationship's player/coach ids", async () => {
    const { ctx, insertValues } = makeCtx({});
    const { startsAt, endsAt } = nextWednesdayEvening();

    const result = await proposeCoachingSession(ctx, {
      startsAt,
      endsAt,
      note: "Let's talk sleep schedule",
    });

    expect(result.status).toBe("proposed");
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        relationshipId: REL.id,
        playerUserId: REL.playerUserId,
        coachUserId: REL.coachUserId,
        proposedByUserId: REL.playerUserId,
        status: "proposed",
        note: "Let's talk sleep schedule",
      }),
    );
  });

  it("normalizes an empty note to undefined via the Zod schema (not the UI)", async () => {
    const { proposeCoachingSessionInput } = await import(
      "./proposeCoachingSession"
    );
    const { startsAt, endsAt } = nextWednesdayEvening();
    const parsed = proposeCoachingSessionInput.parse({
      startsAt,
      endsAt,
      note: "   ",
    });
    expect(parsed.note).toBeUndefined();
  });
});
