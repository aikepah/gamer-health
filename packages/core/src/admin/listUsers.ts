import { z } from "zod/v4";

import type { UserRole } from "@gamer-health/validators";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  max,
  or,
} from "@gamer-health/db";
import { Checkin, GameSession, Profile, user } from "@gamer-health/db/schema";
import { USER_ROLES } from "@gamer-health/validators";

import type { ServiceCtx } from "../ctx";
import { requireRole } from "../authz/requireRole";

export const listUsersInput = z.object({
  query: z.string().trim().max(255).optional(),
  role: z.enum(USER_ROLES).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
export type ListUsersInput = z.infer<typeof listUsersInput>;

export interface ListUsersRow {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  deactivatedAt: Date | null;
  createdAt: Date;
  sessionCount: number;
  checkinCount: number;
  lastActiveAt: Date | null;
}

export interface ListUsersResult {
  total: number;
  users: ListUsersRow[];
}

/**
 * Lists users (newest first) with role/active status and coarse activity
 * aggregates, for the `/admin/users` console. Never surfaces wellness
 * detail (moods, notes) — session/check-in counts and a last-active
 * timestamp only. Admin-only (`requireRole`).
 */
export async function listUsers(
  ctx: ServiceCtx,
  input: ListUsersInput,
): Promise<ListUsersResult> {
  await requireRole(ctx, ["admin"]);

  const conditions = [];
  if (input.query) {
    const pattern = `%${input.query}%`;
    conditions.push(or(ilike(user.name, pattern), ilike(user.email, pattern)));
  }
  if (input.role) {
    // No profile row -> implicit "player"; match that default explicitly.
    conditions.push(
      input.role === "player"
        ? or(isNull(Profile.role), eq(Profile.role, "player"))
        : eq(Profile.role, input.role),
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    ctx.db
      .select({
        userId: user.id,
        name: user.name,
        email: user.email,
        role: Profile.role,
        deactivatedAt: Profile.deactivatedAt,
        createdAt: user.createdAt,
      })
      .from(user)
      .leftJoin(Profile, eq(Profile.userId, user.id))
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(input.limit)
      .offset(input.offset),
    ctx.db
      .select({ value: count() })
      .from(user)
      .leftJoin(Profile, eq(Profile.userId, user.id))
      .where(where),
  ]);

  const total = totalRows[0]?.value ?? 0;
  const userIds = rows.map((r) => r.userId);
  if (userIds.length === 0) {
    return { total, users: [] };
  }

  const [sessionAgg, checkinAgg] = await Promise.all([
    ctx.db
      .select({
        userId: GameSession.userId,
        value: count(),
        lastAt: max(GameSession.startedAt),
      })
      .from(GameSession)
      .where(inArray(GameSession.userId, userIds))
      .groupBy(GameSession.userId),
    ctx.db
      .select({
        userId: Checkin.userId,
        value: count(),
        lastAt: max(Checkin.createdAt),
      })
      .from(Checkin)
      .where(inArray(Checkin.userId, userIds))
      .groupBy(Checkin.userId),
  ]);

  const sessionByUser = new Map(sessionAgg.map((r) => [r.userId, r]));
  const checkinByUser = new Map(checkinAgg.map((r) => [r.userId, r]));

  const users = rows.map((r) => {
    const s = sessionByUser.get(r.userId);
    const c = checkinByUser.get(r.userId);
    const sLast = s?.lastAt ?? null;
    const cLast = c?.lastAt ?? null;
    let lastActiveAt: Date | null;
    if (sLast && cLast) {
      lastActiveAt = sLast > cLast ? sLast : cLast;
    } else {
      lastActiveAt = sLast ?? cLast;
    }

    return {
      userId: r.userId,
      name: r.name,
      email: r.email,
      role: r.role ?? "player",
      deactivatedAt: r.deactivatedAt,
      createdAt: r.createdAt,
      sessionCount: s?.value ?? 0,
      checkinCount: c?.value ?? 0,
      lastActiveAt,
    };
  });

  return { total, users };
}
