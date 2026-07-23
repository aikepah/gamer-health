import { z } from "zod/v4";

import { and, asc, desc, eq, sql } from "@gamer-health/db";
import { Goal, user } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../../ctx";
import { localDateString } from "../../lib/dates";

/**
 * Shared plumbing for goals (#13, docs/features/goals.md): the row type,
 * normalization helpers, and the reader behind `listMyGoals` /
 * `listPlayerGoals` (they list exactly one player's goals and differ only in
 * who's authorized to call them and whose timezone `overdue` is computed
 * against).
 */

export type GoalRow = typeof Goal.$inferSelect;

const DATE_STRING_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * For fields that are always fully re-specified (create): both "omitted" and
 * "" collapse to `null` since there's no partial-update ambiguity to
 * preserve. Normalization lives here, not in the UI, per the service-layer
 * boundary — every caller (tRPC, seed, a future AI tool) goes through it.
 *
 * NOTE on chain order: `.default()`/`.optional()` must be the OUTERMOST call
 * for the object key to come out optional in `z.infer` — putting `.transform`
 * last (wrapping an inner `.optional()`) type-checks as a REQUIRED key even
 * though it accepts `undefined` at runtime, which is exactly backwards for
 * what we need here.
 */
export function nullableText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === "" ? null : value))
    .default(null);
}

/** Same collapse as `nullableText`, plus the "YYYY-MM-DD" format check. */
export function dateStringOrNull() {
  return z
    .string()
    .nullable()
    .transform((value) => (value === "" ? null : value))
    .refine((value) => value === null || DATE_STRING_RE.test(value), {
      message: "targetDate must be YYYY-MM-DD",
    })
    .default(null);
}

/**
 * For PATCH-style fields (update): `undefined` (key omitted) must stay
 * `undefined` so the service can tell "don't touch this field" apart from
 * "clear it" (`null`) — only `""` collapses to `null`. `.optional()` last
 * (see note on `nullableText` above) both keeps the object key optional in
 * `z.infer` AND short-circuits so an omitted key never reaches the
 * transform below (it stays `undefined`, not `null`).
 */
export function patchableText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === "" ? null : value))
    .optional();
}

/** Patch-preserving variant of `dateStringOrNull` — see `patchableText`. */
export function patchableDateStringOrNull() {
  return z
    .string()
    .nullable()
    .transform((value) => (value === "" ? null : value))
    .refine((value) => value === null || DATE_STRING_RE.test(value), {
      message: "targetDate must be YYYY-MM-DD",
    })
    .optional();
}

export interface GoalListItem extends GoalRow {
  assignedBy: { userId: string; name: string } | null;
  /** `targetDate < today` (in `timeZone`) && `status === 'open'`. */
  overdue: boolean;
}

/**
 * Lists `playerUserId`'s goals: open first, then `targetDate` ascending
 * (Postgres defaults ASC to NULLS LAST, so undated goals sort after dated
 * ones within each bucket), then `createdAt` descending. `overdue` is
 * computed against `timeZone` — the CALLER's for `listMyGoals`, the
 * PLAYER's for `listPlayerGoals` (a coach may be in a different timezone
 * than their player).
 */
export async function queryGoalsForPlayer(
  ctx: ServiceCtx,
  playerUserId: string,
  status: GoalRow["status"] | undefined,
  timeZone: string,
): Promise<GoalListItem[]> {
  const rows = await ctx.db
    .select({
      id: Goal.id,
      playerUserId: Goal.playerUserId,
      assignedByUserId: Goal.assignedByUserId,
      relationshipId: Goal.relationshipId,
      title: Goal.title,
      description: Goal.description,
      targetDate: Goal.targetDate,
      status: Goal.status,
      progressNote: Goal.progressNote,
      closedAt: Goal.closedAt,
      createdAt: Goal.createdAt,
      updatedAt: Goal.updatedAt,
      assignedByName: user.name,
    })
    .from(Goal)
    .leftJoin(user, eq(user.id, Goal.assignedByUserId))
    .where(
      status
        ? and(eq(Goal.playerUserId, playerUserId), eq(Goal.status, status))
        : eq(Goal.playerUserId, playerUserId),
    )
    .orderBy(
      desc(sql`${Goal.status} = 'open'`),
      asc(Goal.targetDate),
      desc(Goal.createdAt),
    );

  const today = localDateString(new Date(), timeZone);

  return rows.map(({ assignedByName, ...goal }) => ({
    ...goal,
    assignedBy:
      goal.assignedByUserId && assignedByName
        ? { userId: goal.assignedByUserId, name: assignedByName }
        : null,
    overdue:
      goal.status === "open" &&
      goal.targetDate !== null &&
      goal.targetDate < today,
  }));
}
