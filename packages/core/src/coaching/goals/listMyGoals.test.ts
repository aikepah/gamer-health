import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../../ctx";
import { listMyGoals } from "./listMyGoals";

interface RawRow {
  id: string;
  playerUserId: string;
  assignedByUserId: string | null;
  relationshipId: string | null;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: "open" | "completed" | "abandoned";
  progressNote: string | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignedByName: string | null;
}

function makeCtx(config: {
  callerId?: string;
  timezone?: string | null;
  rows?: RawRow[];
}) {
  const profileFindFirst = vi.fn().mockResolvedValue({
    userId: config.callerId ?? "player_1",
    timezone: config.timezone ?? null,
    platforms: [],
    goals: null,
  });

  const orderBy = vi.fn().mockResolvedValue(config.rows ?? []);
  const where = vi.fn(() => ({ orderBy }));
  const leftJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ leftJoin }));
  const select = vi.fn(() => ({ from }));

  const db = {
    query: { Profile: { findFirst: profileFindFirst } },
    select,
  } as unknown as ServiceCtx["db"];

  return {
    ctx: { db, userId: config.callerId ?? "player_1" } as ServiceCtx,
    where,
  };
}

function row(overrides: Partial<RawRow> = {}): RawRow {
  return {
    id: "goal_1",
    playerUserId: "player_1",
    assignedByUserId: "coach_1",
    relationshipId: "rel_1",
    title: "Sleep by 11pm",
    description: null,
    targetDate: null,
    status: "open",
    progressNote: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    assignedByName: "Demo Coach",
    ...overrides,
  };
}

describe("listMyGoals", () => {
  it("marks an open goal with a past targetDate as overdue against the caller's timezone", async () => {
    const { ctx } = makeCtx({
      timezone: "UTC",
      rows: [row({ targetDate: "2000-01-01" })],
    });

    const [goal] = await listMyGoals(ctx, {});
    expect(goal?.overdue).toBe(true);
  });

  it("does not mark a completed goal overdue even with a past targetDate", async () => {
    const { ctx } = makeCtx({
      timezone: "UTC",
      rows: [
        row({
          status: "completed",
          closedAt: new Date(),
          targetDate: "2000-01-01",
        }),
      ],
    });

    const [goal] = await listMyGoals(ctx, {});
    expect(goal?.overdue).toBe(false);
  });

  it("does not mark an open goal with no targetDate overdue", async () => {
    const { ctx } = makeCtx({
      timezone: "UTC",
      rows: [row({ targetDate: null })],
    });
    const [goal] = await listMyGoals(ctx, {});
    expect(goal?.overdue).toBe(false);
  });

  it("shapes assignedBy from the joined user name", async () => {
    const { ctx } = makeCtx({
      rows: [
        row({ assignedByUserId: "coach_1", assignedByName: "Demo Coach" }),
      ],
    });
    const [goal] = await listMyGoals(ctx, {});
    expect(goal?.assignedBy).toEqual({ userId: "coach_1", name: "Demo Coach" });
  });

  it("defaults to UTC when the caller has no timezone set", async () => {
    const { ctx } = makeCtx({
      timezone: null,
      rows: [row({ targetDate: "2000-01-01" })],
    });
    const [goal] = await listMyGoals(ctx, {});
    expect(goal?.overdue).toBe(true);
  });

  it("filters by status when provided", async () => {
    const { ctx, where } = makeCtx({ rows: [] });
    await listMyGoals(ctx, { status: "completed" });
    expect(where).toHaveBeenCalled();
  });
});
