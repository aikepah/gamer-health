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

import { GAMING_PLATFORMS, USER_ROLES } from "@gamer-health/validators";

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

/** The built-in habit set. Adding a kind is a migration + a core definition. */
export const habitKindEnum = pgEnum("habit_kind", [
  "break_interval",
  "hydrate",
  "stretch",
  "posture",
  "bedtime_cutoff",
  "daily_movement",
]);

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
// Habits — per-user instances of the built-in habit kinds.
// ---------------------------------------------------------------------------

/**
 * Per-kind config stored as jsonb. Which keys apply per kind is defined in
 * docs/features/habit-engine.md; HabitConfigSchema validates the superset.
 */
export interface HabitConfig {
  /** session_interval kinds: prompt every N minutes of active session. */
  intervalMinutes?: number;
  /** daily_movement: local time "HH:MM" the daily prompt is due. */
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

export const HabitDefinition = pgTable("habit_definition", (t) => ({
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
  createdByUserId: t.text().references(() => user.id, { onDelete: "set null" }),
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
}));

export const Habit = pgTable(
  "habit",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * TRANSITIONAL (#8): `kind` and `triggerType` are replaced by
     * `definitionId` → habit_definition. They are dropped — along with the
     * habit_kind enum and habit_user_kind_idx — by the #8 builder in the same
     * PR that refactors core off them. Exact steps:
     * docs/features/habit-generalization.md §Migration.
     */
    kind: habitKindEnum().notNull(),
    triggerType: habitTriggerTypeEnum().notNull(),
    /**
     * Which catalog definition this instance follows. Nullable only during
     * the #8 migration window (backfilled from `kind` by
     * src/migrations/0001-habit-definition-backfill.ts); NOT NULL once the
     * transitional columns are dropped. No cascade: definitions with
     * instances can't be deleted, only archived.
     */
    definitionId: t.uuid().references(() => HabitDefinition.id),
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
    // One instance of each built-in habit per user. Dropped in #8.
    uniqueIndex("habit_user_kind_idx").on(table.userId, table.kind),
    // One instance of each definition per user (nulls distinct, so the
    // migration window is unaffected).
    uniqueIndex("habit_user_definition_idx").on(
      table.userId,
      table.definitionId,
    ),
  ],
);

/** TRANSITIONAL (#8): replaced by a definitionId-keyed upsert input in core. */
export const UpsertHabitSchema = createInsertSchema(Habit, {
  config: HabitConfigSchema,
}).omit({
  id: true,
  userId: true,
  triggerType: true, // derived from kind in core, not client-supplied
  definitionId: true, // migration-window column; #8 makes it the identity
  assignedByUserId: true, // wave 2 (#14), coach-written only
  createdAt: true,
  updatedAt: true,
});

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

export * from "./auth-schema";
