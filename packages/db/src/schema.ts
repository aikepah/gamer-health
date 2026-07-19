import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import {
  COACH_SPECIALTIES,
  COACHING_RELATIONSHIP_STATUSES,
  COACHING_SESSION_STATUSES,
  GAMING_PLATFORMS,
  GOAL_STATUSES,
  USER_ROLES,
} from "@gamer-health/validators";

import { user } from "./auth-schema";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Where a gaming session came from. `steam` reserved for post-MVP sync. */
export const sessionSourceEnum = pgEnum("session_source", ["manual", "steam"]);

/**
 * App-level authorization role. Stored on `profile` (NOT on Better Auth's
 * `user` — auth-schema.ts is generated and must not be edited). A user with
 * no profile row is a `player`. See docs/features/roles-authorization.md.
 */
export const userRoleEnum = pgEnum("user_role", [...USER_ROLES]);

/**
 * How prompts for a habit are generated (see docs/features/habit-engine.md
 * and docs/features/habit-generalization.md). `bedtime_cutoff` (MVP 2, #8) is
 * its own trigger semantics — a daily prompt at `bedtime − leadMinutes` that
 * only fires while a session is active — so the prompt engine switches on
 * triggerType alone, with no per-definition special cases.
 * NOTE: values are append-only (pg enums); keep new values at the end.
 */
export const habitTriggerTypeEnum = pgEnum("habit_trigger_type", [
  "session_interval",
  "daily_schedule",
  "bedtime_cutoff",
]);

export const habitPromptStatusEnum = pgEnum("habit_prompt_status", [
  "pending",
  "done",
  "skipped",
  "expired",
]);

export const checkinContextEnum = pgEnum("checkin_context", [
  "post_session",
  "daily",
]);

/**
 * Player↔coach relationship lifecycle (MVP 2 wave 2, #11). Values come from
 * `COACHING_RELATIONSHIP_STATUSES` in @gamer-health/validators.
 * `active` is the single state `assertCoachOf` keys on.
 * NOTE: pg enum values are append-only; new values go at the end of the
 * validators array (e.g. a future `pending_payment` gate on acceptance).
 */
export const coachingRelationshipStatusEnum = pgEnum(
  "coaching_relationship_status",
  [...COACHING_RELATIONSHIP_STATUSES],
);

/** Scheduled coaching appointment lifecycle (#15). Append-only. */
export const coachingSessionStatusEnum = pgEnum("coaching_session_status", [
  ...COACHING_SESSION_STATUSES,
]);

/** Coach-assigned goal lifecycle (#13). Append-only. */
export const goalStatusEnum = pgEnum("goal_status", [...GOAL_STATUSES]);

// ---------------------------------------------------------------------------
// Profile — app-owned user data. Better Auth owns `user` (auth-schema.ts).
// ---------------------------------------------------------------------------

export const Profile = pgTable("profile", (t) => ({
  /** 1:1 with Better Auth `user`. */
  userId: t
    .text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /**
   * IANA timezone, e.g. "America/Chicago". Drives "local day" logic (streaks,
   * daily prompts). Null = user hasn't chosen yet (UIs may prefill a browser
   * guess; server-side consumers use `?? "UTC"`). Null is distinct from an
   * explicit "UTC" choice, which must never be overwritten by guessing.
   */
  timezone: t.varchar({ length: 64 }),
  /**
   * Free-form platform tags, e.g. ["PC", "PS5"].
   * No DB default (drizzle-kit push churns on array defaults); the Zod
   * insert schema defaults it to [].
   */
  platforms: t.text().array().notNull(),
  /** Free-text wellness/gaming goals. */
  goals: t.text(),
  /**
   * Authorization role (docs/features/roles-authorization.md). Only core
   * authz services write this (setUserRole, acceptCoachInvite, seed) — never
   * the profile upsert.
   */
  role: userRoleEnum().notNull().default("player"),
  /**
   * Set when an admin deactivates the account; null = active. Deactivated
   * users are rejected by every protected procedure (FORBIDDEN).
   */
  deactivatedAt: t.timestamp({ withTimezone: true, mode: "date" }),
  createdAt: t
    .timestamp({ withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: t
    .timestamp({ withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
}));

export const UpsertProfileSchema = createInsertSchema(Profile, {
  // Required on upsert even though the column is nullable: saving a profile
  // always records an explicit timezone choice.
  timezone: z.string().min(1).max(64),
  // Closed set: the settings UI renders fixed chips and silently drops
  // anything else, so reject unknown tags at the boundary.
  platforms: z.array(z.enum(GAMING_PLATFORMS)).max(10).default([]),
  goals: z.string().max(1000).nullish(),
}).omit({
  userId: true,
  role: true, // authz-owned; only core authz services write it
  deactivatedAt: true, // admin-owned
  createdAt: true,
  updatedAt: true,
});

// ---------------------------------------------------------------------------
// Admin audit log — append-only record of privileged admin actions (role
// changes, de/reactivations, invite lifecycle, game merges/deletes). `action`
// is plain text like reward_event.eventType: the taxonomy lives in core
// constants, so adding an action is a code change, not a migration.
// ---------------------------------------------------------------------------

export const AdminAuditLog = pgTable(
  "admin_audit_log",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    /** Who performed the action (usually an admin; invite acceptor for `invite_accept`). */
    actorUserId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Affected user, when the action targets one (null for content actions). */
    targetUserId: t.text().references(() => user.id, { onDelete: "set null" }),
    /** e.g. "role_change" | "user_deactivate" | "game_merge" — core constants. */
    action: t.varchar({ length: 64 }).notNull(),
    /** Action-specific detail, e.g. { from: "player", to: "coach" }. */
    meta: t.jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    index("admin_audit_log_created_idx").on(table.createdAt.desc()),
    index("admin_audit_log_target_idx").on(
      table.targetUserId,
      table.createdAt.desc(),
    ),
  ],
);

// ---------------------------------------------------------------------------
// Coach invitations (#6) — admin issues a tokenized link (no email sending in
// MVP; the admin copies the link, so the token is stored in plaintext to stay
// re-copyable — acceptable for MVP, revisit if invites ever carry more power).
// Status is derived, never stored: revoked (revokedAt) > accepted (acceptedAt)
// > expired (expiresAt < now) > pending. "One pending unexpired invite per
// email" is enforced in core (expiry can't sit in a partial unique index).
// ---------------------------------------------------------------------------

export const CoachInvite = pgTable(
  "coach_invite",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    /** Invited email, stored lowercased (core normalizes at the boundary). */
    email: t.varchar({ length: 255 }).notNull(),
    /** URL-safe random secret (crypto.randomBytes(24).toString("base64url")). */
    token: t.varchar({ length: 64 }).notNull().unique(),
    invitedByUserId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: t.timestamp({ withTimezone: true, mode: "date" }).notNull(),
    revokedAt: t.timestamp({ withTimezone: true, mode: "date" }),
    acceptedAt: t.timestamp({ withTimezone: true, mode: "date" }),
    /** Cascade (not set-null): the accepted-by check below requires this to
     * stay in lockstep with acceptedAt, so a deleted acceptor removes the row. */
    acceptedByUserId: t
      .text()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    index("coach_invite_email_idx").on(table.email),
    // An invite can't be both revoked and accepted.
    check(
      "coach_invite_state_check",
      sql`NOT (${table.revokedAt} IS NOT NULL AND ${table.acceptedAt} IS NOT NULL)`,
    ),
    // Acceptance always records who accepted.
    check(
      "coach_invite_accepted_by_check",
      sql`(${table.acceptedAt} IS NULL) = (${table.acceptedByUserId} IS NULL)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Coach profile (#9) — the public-facing coach record. 1:1 with `user`, but
// only for users whose `profile.role` is `coach`; core creates it lazily
// (getOrCreateCoachProfile) the first time a coach opens /coach/profile.
//
// Deliberately NOT merged into `profile`: `profile` is every user's private
// app data, while this row is public (discovery, #10) and coach-only. Keeping
// them apart means "is this coach discoverable" is one boolean on one table
// and no player row carries dead coach columns.
//
// Availability times (coach_availability below) are wall-clock times in the
// coach's `profile.timezone` — there is no separate coach timezone column, so
// there is exactly one source of truth. Core requires a non-null
// `profile.timezone` before `isPublished` can be set true.
// ---------------------------------------------------------------------------

export const CoachProfile = pgTable(
  "coach_profile",
  (t) => ({
    userId: t
      .text()
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    /** One-line tagline shown on discovery cards. */
    headline: t.varchar({ length: 120 }),
    /** Long-form public bio (markdown not rendered — plain text in MVP). */
    bio: t.text(),
    /**
     * Closed-set tags from `COACH_SPECIALTIES` (@gamer-health/validators).
     * No DB default (drizzle-kit push churns on array defaults), same as
     * `profile.platforms`; the Zod schema defaults it to [].
     */
    specialties: t.text().array().notNull(),
    /**
     * The discovery gate (#10): false = invisible in `/coaches` no matter
     * what. A coach must have a timezone, a headline and >= 1 availability
     * block to publish (enforced in core, not the DB).
     */
    isPublished: t.boolean().notNull().default(false),
    /**
     * Published but closed to new players: still listed and viewable, but
     * `applyToCoach` (#10) rejects with CONFLICT. Separate from
     * `isPublished` so a full roster doesn't have to delist.
     */
    acceptingApplications: t.boolean().notNull().default(true),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [index("coach_profile_published_idx").on(table.isPublished)],
);

export const UpsertCoachProfileSchema = createInsertSchema(CoachProfile, {
  headline: z.string().trim().min(1).max(120).nullish(),
  bio: z.string().max(4000).nullish(),
  specialties: z.array(z.enum(COACH_SPECIALTIES)).max(8).default([]),
}).omit({
  userId: true, // from ctx
  isPublished: true, // own service (setCoachPublished) — has preconditions
  acceptingApplications: true, // own service
  createdAt: true,
  updatedAt: true,
});

// ---------------------------------------------------------------------------
// Games a coach coaches (#9) — join table driving discovery's game filter.
//
// IMPORTANT (#7 interop): `mergeGames` must repoint these rows inside its
// transaction (insert-select onConflictDoNothing into the target, then delete
// the source rows) — a plain UPDATE would violate the PK when the coach
// already coaches both games. See docs/features/coach-profiles.md.
// ---------------------------------------------------------------------------

export const CoachGame = pgTable(
  "coach_game",
  (t) => ({
    coachUserId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gameId: t
      .uuid()
      .notNull()
      .references(() => Game.id, { onDelete: "cascade" }),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    primaryKey({ columns: [table.coachUserId, table.gameId] }),
    // Discovery filters "coaches who coach game X"; the PK's leading column
    // is the coach, so this reverse index carries that query.
    index("coach_game_game_idx").on(table.gameId),
  ],
);

// ---------------------------------------------------------------------------
// Weekly recurring availability (#9) — the window scheduling (#15) validates
// proposed slots against.
//
// Times are minutes from local midnight (0–1440) rather than `time` columns:
// slot containment in #15 is then plain integer arithmetic with no time-type
// parsing. Blocks never cross midnight (`endMinute > startMinute` is checked);
// a 22:00–02:00 coach creates two blocks. Overlapping blocks on the same
// weekday are rejected in core (the DB can't express that without btree_gist).
// ---------------------------------------------------------------------------

export const CoachAvailability = pgTable(
  "coach_availability",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    coachUserId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** 0 = Sunday … 6 = Saturday (matches JS `Date#getDay()`). */
    weekday: t.smallint().notNull(),
    /** Inclusive start, minutes from local midnight (0–1439). */
    startMinute: t.smallint().notNull(),
    /** Exclusive end, minutes from local midnight (1–1440). */
    endMinute: t.smallint().notNull(),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    index("coach_availability_coach_weekday_idx").on(
      table.coachUserId,
      table.weekday,
    ),
    // Cheap dedupe of identical blocks; genuine overlap is core's job.
    uniqueIndex("coach_availability_unique_block_idx").on(
      table.coachUserId,
      table.weekday,
      table.startMinute,
    ),
    check(
      "coach_availability_weekday_check",
      sql`${table.weekday} BETWEEN 0 AND 6`,
    ),
    check(
      "coach_availability_range_check",
      sql`${table.startMinute} >= 0 AND ${table.endMinute} <= 1440 AND ${table.endMinute} > ${table.startMinute}`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Coaching relationship (#11) — the player↔coach lifecycle, and the table
// `assertCoachOf` reads. See docs/features/coaching-relationships.md.
//
// Fixed decisions (architect):
//  - A player has AT MOST ONE `active` coach, enforced by a partial unique
//    index. Every wave-2 feature ("their coach", goal ownership, habit
//    assignment, scheduling) is written in the singular, and a single active
//    row keeps `assertCoachOf` a one-row lookup.
//  - A player MAY have several `applied` rows at once (to different coaches)
//    — discovery is useless if you can only shop one coach at a time. When a
//    coach accepts, core auto-declines the player's other `applied` rows in
//    the same transaction, so the one-active index is never the thing that
//    surfaces the conflict.
//  - Rows are never deleted; terminal states (`declined`, `ended`) are the
//    history. Re-applying to the same coach after an `ended` relationship
//    creates a NEW row (the open-pair index only covers applied/active).
//  - Payment gate insertion point: `acceptCoachApplication` is the ONLY
//    writer of `status = 'active'`. A future subscription check goes at the
//    top of its transaction; no payment columns exist today.
// ---------------------------------------------------------------------------

export const CoachingRelationship = pgTable(
  "coaching_relationship",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    playerUserId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    coachUserId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: coachingRelationshipStatusEnum().notNull().default("applied"),
    /** Who created the row. Always the player in MVP (coach-initiated invites are post-MVP). */
    initiatedByUserId: t
      .text()
      .references(() => user.id, { onDelete: "set null" }),
    /** The player's application message. */
    message: t.text(),
    /** Coach's decline reason, or the auto-decline note when another coach was chosen. */
    responseNote: t.varchar({ length: 500 }),
    /** Reason recorded when an active relationship is ended. */
    endReason: t.varchar({ length: 500 }),
    appliedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    /** When the coach accepted or declined. */
    respondedAt: t.timestamp({ withTimezone: true, mode: "date" }),
    /** When the relationship became active (equals respondedAt on accept). */
    startedAt: t.timestamp({ withTimezone: true, mode: "date" }),
    endedAt: t.timestamp({ withTimezone: true, mode: "date" }),
    endedByUserId: t.text().references(() => user.id, { onDelete: "set null" }),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    // AT MOST ONE active coach per player — the invariant assertCoachOf and
    // all of #12–#15 rely on.
    uniqueIndex("coaching_relationship_one_active_per_player_idx")
      .on(table.playerUserId)
      .where(sql`${table.status} = 'active'`),
    // No duplicate open applications to the same coach.
    uniqueIndex("coaching_relationship_open_pair_idx")
      .on(table.playerUserId, table.coachUserId)
      .where(sql`${table.status} IN ('applied', 'active')`),
    // Roster + application inbox for a coach.
    index("coaching_relationship_coach_status_idx").on(
      table.coachUserId,
      table.status,
      table.appliedAt.desc(),
    ),
    // "My coach" card + application list for a player.
    index("coaching_relationship_player_status_idx").on(
      table.playerUserId,
      table.status,
      table.appliedAt.desc(),
    ),
    check(
      "coaching_relationship_distinct_parties_check",
      sql`${table.playerUserId} <> ${table.coachUserId}`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Goals (#13) — coach-assigned objectives a player tracks.
// `relationshipId` records provenance; goals SURVIVE the relationship ending
// (the player keeps them, the coach just loses visibility), which is why it
// is `set null` rather than cascade.
// ---------------------------------------------------------------------------

export const Goal = pgTable(
  "goal",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    playerUserId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * The coach who assigned it. Nullable so a deleted coach account doesn't
     * take the player's goals with it — and so player-authored self-goals
     * (post-MVP) fit without a migration. #13 always sets it.
     */
    assignedByUserId: t
      .text()
      .references(() => user.id, { onDelete: "set null" }),
    relationshipId: t.uuid().references(() => CoachingRelationship.id, {
      onDelete: "set null",
    }),
    title: t.varchar({ length: 160 }).notNull(),
    description: t.text(),
    /** Optional local calendar due date, "YYYY-MM-DD" (no time component). */
    targetDate: t.date({ mode: "string" }),
    status: goalStatusEnum().notNull().default("open"),
    /** Player-editable free-text progress note — "tracking" in MVP is this plus status. */
    progressNote: t.text(),
    /** Set when status leaves `open`; cleared if it is reopened. */
    closedAt: t.timestamp({ withTimezone: true, mode: "date" }),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    index("goal_player_status_idx").on(
      table.playerUserId,
      table.status,
      table.targetDate,
    ),
    index("goal_assigned_by_status_idx").on(
      table.assignedByUserId,
      table.status,
    ),
    check(
      "goal_closed_at_check",
      sql`(${table.status} = 'open') = (${table.closedAt} IS NULL)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Coaching sessions (#15) — scheduled appointments between a player and their
// coach. `startsAt`/`endsAt` are absolute instants; the coach's weekly
// availability is wall-clock, so validation converts the instant into the
// coach's `profile.timezone` before the containment check.
//
// `playerUserId`/`coachUserId` are denormalized from the relationship (like
// `habit_prompt.userId` from `habit`) so both sides' "upcoming" lists are a
// single indexed scan with no join.
//
// Overlap is enforced in core, not the DB: excluding overlapping ranges needs
// a btree_gist EXCLUDE constraint, which drizzle-kit push can't express.
// ---------------------------------------------------------------------------

export const CoachingSession = pgTable(
  "coaching_session",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    relationshipId: t
      .uuid()
      .notNull()
      .references(() => CoachingRelationship.id, { onDelete: "cascade" }),
    playerUserId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    coachUserId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Always the player in MVP; column exists so coach-proposed slots need no migration. */
    proposedByUserId: t
      .text()
      .references(() => user.id, { onDelete: "set null" }),
    startsAt: t.timestamp({ withTimezone: true, mode: "date" }).notNull(),
    endsAt: t.timestamp({ withTimezone: true, mode: "date" }).notNull(),
    status: coachingSessionStatusEnum().notNull().default("proposed"),
    /** Player's agenda note on proposal. */
    note: t.text(),
    confirmedAt: t.timestamp({ withTimezone: true, mode: "date" }),
    cancelledAt: t.timestamp({ withTimezone: true, mode: "date" }),
    cancelledByUserId: t
      .text()
      .references(() => user.id, { onDelete: "set null" }),
    /** Distinguishes a coach decline (confirmedAt null) from a later cancel. */
    cancelReason: t.varchar({ length: 500 }),
    completedAt: t.timestamp({ withTimezone: true, mode: "date" }),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    index("coaching_session_coach_starts_idx").on(
      table.coachUserId,
      table.startsAt,
    ),
    index("coaching_session_player_starts_idx").on(
      table.playerUserId,
      table.startsAt,
    ),
    index("coaching_session_relationship_idx").on(table.relationshipId),
    check(
      "coaching_session_time_order_check",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Games — simple catalog (seeded list + user free-text additions).
// steamAppId anticipates post-MVP Steam sync.
// ---------------------------------------------------------------------------

export const Game = pgTable(
  "game",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    name: t.varchar({ length: 256 }).notNull(),
    /** Optional free-form platform hint, e.g. "PC". */
    platform: t.varchar({ length: 64 }),
    /** Set by post-MVP Steam sync; unique when present. */
    steamAppId: t.integer().unique(),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    // Case-insensitive dedupe for free-text game creation.
    uniqueIndex("game_name_lower_idx").on(sql`lower(${table.name})`),
  ],
);

export const CreateGameSchema = createInsertSchema(Game, {
  name: z.string().trim().min(1).max(256),
  platform: z.string().trim().min(1).max(64).nullish(),
}).omit({
  id: true,
  steamAppId: true, // only Steam sync writes this
  createdAt: true,
});

// ---------------------------------------------------------------------------
// Gaming sessions. Named GameSession / `game_session` to avoid colliding with
// Better Auth's `session` table.
// ---------------------------------------------------------------------------

export const GameSession = pgTable(
  "game_session",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gameId: t
      .uuid()
      .notNull()
      .references(() => Game.id),
    startedAt: t.timestamp({ withTimezone: true, mode: "date" }).notNull(),
    /** Null while the session is active (live timer). */
    endedAt: t.timestamp({ withTimezone: true, mode: "date" }),
    source: sessionSourceEnum().notNull().default("manual"),
    notes: t.text(),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    index("game_session_user_started_idx").on(
      table.userId,
      table.startedAt.desc(),
    ),
    // At most one active (endedAt IS NULL) session per user.
    uniqueIndex("game_session_one_active_per_user_idx")
      .on(table.userId)
      .where(sql`${table.endedAt} IS NULL`),
    check(
      "game_session_time_order_check",
      sql`${table.endedAt} IS NULL OR ${table.endedAt} > ${table.startedAt}`,
    ),
  ],
);

/** Retroactive full-session log (start/stop timer flows use dedicated inputs in core). */
export const LogGameSessionSchema = createInsertSchema(GameSession, {
  notes: z.string().max(2000).nullish(),
})
  .omit({
    id: true,
    userId: true, // from ctx
    source: true, // manual flows only; steam sync sets its own
    createdAt: true,
    updatedAt: true,
  })
  .required({ endedAt: true });

// ---------------------------------------------------------------------------
// Habits — per-user instances of a habit_definition catalog entry.
// ---------------------------------------------------------------------------

/**
 * Per-trigger-type config stored as jsonb. Which keys apply per trigger type
 * is defined in docs/features/habit-generalization.md; HabitConfigSchema
 * validates the superset.
 */
export interface HabitConfig {
  /** session_interval: prompt every N minutes of active session. */
  intervalMinutes?: number;
  /** daily_schedule: local time "HH:MM" the daily prompt is due. */
  timeOfDay?: string;
  /** bedtime_cutoff: local bedtime "HH:MM". */
  bedtime?: string;
  /** bedtime_cutoff: prompt fires this many minutes before bedtime. */
  leadMinutes?: number;
}

const timeOfDayRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const HabitConfigSchema = z.object({
  intervalMinutes: z.number().int().min(5).max(240).optional(),
  timeOfDay: z.string().regex(timeOfDayRegex).optional(),
  bedtime: z.string().regex(timeOfDayRegex).optional(),
  leadMinutes: z.number().int().min(0).max(240).optional(),
});

// ---------------------------------------------------------------------------
// Habit definitions (#8) — the habit catalog, replacing the closed habit_kind
// enum. Three origins share one shape:
//   built-in     slug != null, createdByUserId null,  isDefault true
//   admin default slug null,   createdByUserId admin, isDefault true
//   coach custom  slug null,   createdByUserId coach, isDefault false (wave 2, #14)
// Players see isDefault && !archivedAt, plus definitions they already have an
// instance of. See docs/features/habit-generalization.md.
// ---------------------------------------------------------------------------

export const HabitDefinition = pgTable(
  "habit_definition",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    /**
     * Stable code-facing key for built-ins only (matches the old habit_kind
     * values, e.g. "hydrate"); null for admin/coach-created definitions.
     * Gamification keys streaks off this (meta.habitKind = slug ?? null), and
     * seed/migration upsert built-ins by it. Unique constraint (nulls distinct).
     */
    slug: t.varchar({ length: 64 }).unique(),
    title: t.varchar({ length: 120 }).notNull(),
    description: t.text().notNull(),
    /** Shown on generated prompts. */
    promptText: t.varchar({ length: 200 }).notNull(),
    /** Immutable after creation — config validation and prompt semantics hang off it. */
    triggerType: habitTriggerTypeEnum().notNull(),
    defaultConfig: t.jsonb().$type<HabitConfig>().notNull().default({}),
    /** True = offered to every player in the catalog (built-ins + admin defaults). */
    isDefault: t.boolean().notNull().default(false),
    /** Null = system built-in; else the admin (or wave-2 coach) who created it. */
    createdByUserId: t
      .text()
      .references(() => user.id, { onDelete: "set null" }),
    /** Soft-retire from the adopt list; existing user habits keep working. */
    archivedAt: t.timestamp({ withTimezone: true, mode: "date" }),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    // #14: a coach listing the custom definitions they authored. Also serves
    // the admin content console's "created by" filter.
    index("habit_definition_created_by_idx").on(table.createdByUserId),
  ],
);

export const Habit = pgTable(
  "habit",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * Which catalog definition this instance follows. No cascade: definitions
     * with instances can't be deleted, only archived.
     */
    definitionId: t
      .uuid()
      .notNull()
      .references(() => HabitDefinition.id),
    /**
     * Wave 2 (#14): coach who assigned this habit; null = self-adopted.
     * Added now so #14 needs no further habit-table migration.
     */
    assignedByUserId: t
      .text()
      .references(() => user.id, { onDelete: "set null" }),
    enabled: t.boolean().notNull().default(true),
    config: t.jsonb().$type<HabitConfig>().notNull().default({}),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    // One instance of each definition per user.
    uniqueIndex("habit_user_definition_idx").on(
      table.userId,
      table.definitionId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Habit prompts — generated instances (generation-on-read; no job runner).
// ---------------------------------------------------------------------------

export const HabitPrompt = pgTable(
  "habit_prompt",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    habitId: t
      .uuid()
      .notNull()
      .references(() => Habit.id, { onDelete: "cascade" }),
    /** Denormalized from habit for fast per-user queries. */
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Set for session_interval prompts; null for daily_schedule prompts. */
    sessionId: t.uuid().references(() => GameSession.id, {
      onDelete: "cascade",
    }),
    dueAt: t.timestamp({ withTimezone: true, mode: "date" }).notNull(),
    status: habitPromptStatusEnum().notNull().default("pending"),
    respondedAt: t.timestamp({ withTimezone: true, mode: "date" }),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    // dueAt is computed deterministically, so this makes generation idempotent.
    uniqueIndex("habit_prompt_dedupe_idx").on(table.habitId, table.dueAt),
    index("habit_prompt_user_status_due_idx").on(
      table.userId,
      table.status,
      table.dueAt,
    ),
    index("habit_prompt_session_idx").on(table.sessionId),
  ],
);

// ---------------------------------------------------------------------------
// Check-ins — 10-second mood/energy/sleep entries.
// ---------------------------------------------------------------------------

export const Checkin = pgTable(
  "checkin",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    context: checkinContextEnum().notNull(),
    /** Set for post_session check-ins; kept if the session is later deleted. */
    sessionId: t.uuid().references(() => GameSession.id, {
      onDelete: "set null",
    }),
    /** 1–5, required — a check-in is at minimum a mood reading. */
    mood: t.smallint().notNull(),
    /** 1–5, optional. */
    energy: t.smallint(),
    /** 1–5, optional; primarily for daily check-ins. */
    sleepQuality: t.smallint(),
    note: t.text(),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    index("checkin_user_created_idx").on(table.userId, table.createdAt.desc()),
    // At most one post_session check-in per session (DB-enforced so
    // concurrent/retried creates can't slip past the app-level guard).
    uniqueIndex("checkin_one_per_session_idx")
      .on(table.sessionId)
      .where(sql`${table.context} = 'post_session'`),
    check("checkin_mood_range_check", sql`${table.mood} BETWEEN 1 AND 5`),
    check(
      "checkin_energy_range_check",
      sql`${table.energy} IS NULL OR ${table.energy} BETWEEN 1 AND 5`,
    ),
    check(
      "checkin_sleep_quality_range_check",
      sql`${table.sleepQuality} IS NULL OR ${table.sleepQuality} BETWEEN 1 AND 5`,
    ),
  ],
);

const rating = z.number().int().min(1).max(5);

export const CreateCheckinSchema = createInsertSchema(Checkin, {
  mood: rating,
  energy: rating.nullish(),
  sleepQuality: rating.nullish(),
  note: z.string().max(1000).nullish(),
}).omit({
  id: true,
  userId: true,
  createdAt: true,
});

// ---------------------------------------------------------------------------
// Reward events — the ONLY source of truth for XP. Levels are derived
// (packages/core gamification); streak counters are a rebuildable projection.
// eventType/sourceKind are intentionally plain text: the taxonomy lives in
// packages/core constants (docs/features/gamification.md), so adding an event
// type is a code change, not a migration.
// ---------------------------------------------------------------------------

export const RewardEvent = pgTable(
  "reward_event",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** e.g. "session_logged", "habit_prompt_completed" — see gamification spec. */
    eventType: t.varchar({ length: 64 }).notNull(),
    xp: t.integer().notNull(),
    /** Polymorphic source: "game_session" | "habit_prompt" | "checkin" | "achievement". */
    sourceKind: t.varchar({ length: 32 }).notNull(),
    /** Id of the source entity (uuid, or achievement key). No FK on purpose. */
    sourceId: t.text().notNull(),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    // Idempotency: one reward per (user, event, source). Emitters insert with
    // onConflictDoNothing.
    uniqueIndex("reward_event_dedupe_idx").on(
      table.userId,
      table.eventType,
      table.sourceKind,
      table.sourceId,
    ),
    index("reward_event_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
  ],
);

// ---------------------------------------------------------------------------
// Achievements — definitions are code-defined constants in packages/core
// (key, title, description, xp, criteria). Only unlocks are persisted; no
// `achievement` table. See docs/features/gamification.md for the rationale.
// ---------------------------------------------------------------------------

export const UserAchievement = pgTable(
  "user_achievement",
  (t) => ({
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Key of a code-defined achievement, e.g. "hydration_streak_7". */
    achievementKey: t.varchar({ length: 64 }).notNull(),
    unlockedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  }),
  (table) => [primaryKey({ columns: [table.userId, table.achievementKey] })],
);

// ---------------------------------------------------------------------------
// Streaks — stored per-user counters (single writer: the gamification
// engine's recordRewardEvent). reward_event history remains the ground truth,
// so counters are rebuildable. See docs/features/gamification.md.
// ---------------------------------------------------------------------------

export const Streak = pgTable(
  "streak",
  (t) => ({
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** e.g. "daily_checkin", "daily_habit", "habit_hydrate" — core constants. */
    kind: t.varchar({ length: 64 }).notNull(),
    current: t.integer().notNull().default(0),
    longest: t.integer().notNull().default(0),
    /** Local date (user timezone) of the last qualifying activity, "YYYY-MM-DD". */
    lastActivityDate: t.date({ mode: "string" }),
    updatedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [primaryKey({ columns: [table.userId, table.kind] })],
);

// ---------------------------------------------------------------------------
// Relations (drizzle query API)
// ---------------------------------------------------------------------------

export const ProfileRelations = relations(Profile, ({ one }) => ({
  user: one(user, { fields: [Profile.userId], references: [user.id] }),
}));

export const AdminAuditLogRelations = relations(AdminAuditLog, ({ one }) => ({
  actor: one(user, {
    fields: [AdminAuditLog.actorUserId],
    references: [user.id],
    relationName: "admin_audit_log_actor",
  }),
  target: one(user, {
    fields: [AdminAuditLog.targetUserId],
    references: [user.id],
    relationName: "admin_audit_log_target",
  }),
}));

export const CoachInviteRelations = relations(CoachInvite, ({ one }) => ({
  invitedBy: one(user, {
    fields: [CoachInvite.invitedByUserId],
    references: [user.id],
    relationName: "coach_invite_invited_by",
  }),
  acceptedBy: one(user, {
    fields: [CoachInvite.acceptedByUserId],
    references: [user.id],
    relationName: "coach_invite_accepted_by",
  }),
}));

export const HabitDefinitionRelations = relations(
  HabitDefinition,
  ({ one, many }) => ({
    createdBy: one(user, {
      fields: [HabitDefinition.createdByUserId],
      references: [user.id],
    }),
    habits: many(Habit),
  }),
);

export const GameRelations = relations(Game, ({ many }) => ({
  sessions: many(GameSession),
  coaches: many(CoachGame),
}));

export const GameSessionRelations = relations(GameSession, ({ one, many }) => ({
  user: one(user, { fields: [GameSession.userId], references: [user.id] }),
  game: one(Game, { fields: [GameSession.gameId], references: [Game.id] }),
  prompts: many(HabitPrompt),
  checkins: many(Checkin),
}));

export const HabitRelations = relations(Habit, ({ one, many }) => ({
  user: one(user, {
    fields: [Habit.userId],
    references: [user.id],
    relationName: "habit_user",
  }),
  definition: one(HabitDefinition, {
    fields: [Habit.definitionId],
    references: [HabitDefinition.id],
  }),
  assignedBy: one(user, {
    fields: [Habit.assignedByUserId],
    references: [user.id],
    relationName: "habit_assigned_by",
  }),
  prompts: many(HabitPrompt),
}));

export const HabitPromptRelations = relations(HabitPrompt, ({ one }) => ({
  habit: one(Habit, {
    fields: [HabitPrompt.habitId],
    references: [Habit.id],
  }),
  user: one(user, { fields: [HabitPrompt.userId], references: [user.id] }),
  session: one(GameSession, {
    fields: [HabitPrompt.sessionId],
    references: [GameSession.id],
  }),
}));

export const CheckinRelations = relations(Checkin, ({ one }) => ({
  user: one(user, { fields: [Checkin.userId], references: [user.id] }),
  session: one(GameSession, {
    fields: [Checkin.sessionId],
    references: [GameSession.id],
  }),
}));

export const RewardEventRelations = relations(RewardEvent, ({ one }) => ({
  user: one(user, { fields: [RewardEvent.userId], references: [user.id] }),
}));

export const UserAchievementRelations = relations(
  UserAchievement,
  ({ one }) => ({
    user: one(user, {
      fields: [UserAchievement.userId],
      references: [user.id],
    }),
  }),
);

export const StreakRelations = relations(Streak, ({ one }) => ({
  user: one(user, { fields: [Streak.userId], references: [user.id] }),
}));

export const CoachProfileRelations = relations(
  CoachProfile,
  ({ one, many }) => ({
    user: one(user, { fields: [CoachProfile.userId], references: [user.id] }),
    games: many(CoachGame),
    availability: many(CoachAvailability),
  }),
);

export const CoachGameRelations = relations(CoachGame, ({ one }) => ({
  coachProfile: one(CoachProfile, {
    fields: [CoachGame.coachUserId],
    references: [CoachProfile.userId],
  }),
  game: one(Game, { fields: [CoachGame.gameId], references: [Game.id] }),
}));

export const CoachAvailabilityRelations = relations(
  CoachAvailability,
  ({ one }) => ({
    coachProfile: one(CoachProfile, {
      fields: [CoachAvailability.coachUserId],
      references: [CoachProfile.userId],
    }),
  }),
);

export const CoachingRelationshipRelations = relations(
  CoachingRelationship,
  ({ one, many }) => ({
    player: one(user, {
      fields: [CoachingRelationship.playerUserId],
      references: [user.id],
      relationName: "coaching_relationship_player",
    }),
    coach: one(user, {
      fields: [CoachingRelationship.coachUserId],
      references: [user.id],
      relationName: "coaching_relationship_coach",
    }),
    sessions: many(CoachingSession),
    goals: many(Goal),
  }),
);

export const GoalRelations = relations(Goal, ({ one }) => ({
  player: one(user, {
    fields: [Goal.playerUserId],
    references: [user.id],
    relationName: "goal_player",
  }),
  assignedBy: one(user, {
    fields: [Goal.assignedByUserId],
    references: [user.id],
    relationName: "goal_assigned_by",
  }),
  relationship: one(CoachingRelationship, {
    fields: [Goal.relationshipId],
    references: [CoachingRelationship.id],
  }),
}));

export const CoachingSessionRelations = relations(
  CoachingSession,
  ({ one }) => ({
    relationship: one(CoachingRelationship, {
      fields: [CoachingSession.relationshipId],
      references: [CoachingRelationship.id],
    }),
    player: one(user, {
      fields: [CoachingSession.playerUserId],
      references: [user.id],
      relationName: "coaching_session_player",
    }),
    coach: one(user, {
      fields: [CoachingSession.coachUserId],
      references: [user.id],
      relationName: "coaching_session_coach",
    }),
  }),
);

export * from "./auth-schema";
