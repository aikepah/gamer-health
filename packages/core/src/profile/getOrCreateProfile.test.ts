import { describe, expect, it, vi } from "vitest";

import type { ServiceCtx } from "../ctx";
import type { ProfileRow } from "./getOrCreateProfile";
import { CoreError } from "../lib/errors";
import { getOrCreateProfile } from "./getOrCreateProfile";

function makeRow(userId: string): ProfileRow {
  return {
    userId,
    timezone: null,
    platforms: [],
    goals: null,
    role: "player",
    deactivatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeCtx(
  userId: string | null,
  options: {
    findFirstResults?: unknown[];
    insertReturning?: ProfileRow[];
  } = {},
): {
  ctx: ServiceCtx;
  insert: ReturnType<typeof vi.fn>;
} {
  const findFirst = vi.fn();
  (options.findFirstResults ?? []).forEach((result) =>
    findFirst.mockResolvedValueOnce(result),
  );

  const returning = vi.fn().mockResolvedValue(options.insertReturning ?? []);
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  const insert = vi.fn().mockReturnValue({ values });

  const db = {
    query: { Profile: { findFirst } },
    insert,
  } as unknown as ServiceCtx["db"];

  return { ctx: { db, userId }, insert };
}

describe("getOrCreateProfile", () => {
  it("throws CoreError(UNAUTHORIZED) when unauthenticated", async () => {
    const { ctx } = makeCtx(null);
    await expect(getOrCreateProfile(ctx)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("returns the existing profile without inserting", async () => {
    const existing = makeRow("user_1");
    const { ctx, insert } = makeCtx("user_1", {
      findFirstResults: [existing],
    });

    const result = await getOrCreateProfile(ctx);

    expect(result).toBe(existing);
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates a default (timezone-less) profile when none exists", async () => {
    const created = makeRow("user_2");
    const { ctx } = makeCtx("user_2", {
      findFirstResults: [undefined],
      insertReturning: [created],
    });

    const result = await getOrCreateProfile(ctx);

    expect(result).toBe(created);
    expect(result.timezone).toBeNull();
  });

  it("falls back to a re-select when a concurrent request won the insert", async () => {
    const raced = makeRow("user_3");
    const { ctx, insert } = makeCtx("user_3", {
      findFirstResults: [undefined, raced],
      insertReturning: [],
    });

    const result = await getOrCreateProfile(ctx);

    expect(insert).toHaveBeenCalledOnce();
    expect(result).toBe(raced);
  });

  it("throws CoreError(NOT_FOUND) if the race fallback also finds nothing", async () => {
    const { ctx } = makeCtx("user_4", {
      findFirstResults: [undefined, undefined],
      insertReturning: [],
    });
    await expect(getOrCreateProfile(ctx)).rejects.toThrowError(CoreError);
  });
});
