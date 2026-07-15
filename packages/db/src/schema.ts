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

import { user } from "./auth-schema";

// ---------------------------------------------------------------------------
// Template placeholder (kept for now; removed by a later cleanup task)
// ---------------------------------------------------------------------------

export const Post = pgTable("post", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  title: t.varchar({ length: 256 }).notNull(),
  content: t.text().notNull(),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const CreatePostSchema = createInsertSchema(Post, {
  title: z.string().max(256),
  content: z.string().max(256),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Where a gaming session came from. `steam` reserved for post-MVP sync. */
export const sessionSourceEnum = pgEnum("session_source", ["manual", "steam"]);

/** The built-in habit set. Adding a kind is a migration + a core definition. */
export const habitKindEnum = pgEnum("habit_kind", [
  "break_interval",
  "hydrate",
  "stretch",
  "posture",
  "bedtime_cutoff",
  "daily_movement",
]);

/** How prompts for a habit are generated (see docs/features/habit-engine.md). */
export const habitTriggerTypeEnum = pgEnum("habit_trigger_type", [
  "session_interval",
  "daily_schedule",
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
  /** IANA timezone, e.g. "America/Chicago". Drives "local day" logic (streaks, daily prompts). */
  timezone: t.varchar({ length: 64 }).notNull().default("UTC"),
  /**
   * Free-form platform tags, e.g. ["PC", "PS5"].
   * No DB default (drizzle-kit push churns on array defaults); the Zod
   * insert schema defaults it to [].
   */
  platforms: t.text().array().notNull(),
  /** Free-text wellness/gaming goals. */
  goals: t.text(),
  createdAt: t
    .timestamp({ withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: t
    .timestamp({ withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => sql`now()`),
}));

export const UpsertProfileSchema = createInsertSchema(Profile, {
  timezone: z.string().min(1).max(64),
  platforms: z.array(z.string().trim().min(1).max(32)).max(10).default([]),
  goals: z.string().max(1000).nullish(),
}).omit({
  userId: true,
  createdAt: true,
  updatedAt: true,
});

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
      .$onUpdateFn(() => sql`now()`),
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

export const Habit = pgTable(
  "habit",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: habitKindEnum().notNull(),
    triggerType: habitTriggerTypeEnum().notNull(),
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
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    // One instance of each built-in habit per user.
    uniqueIndex("habit_user_kind_idx").on(table.userId, table.kind),
  ],
);

export const UpsertHabitSchema = createInsertSchema(Habit, {
  config: HabitConfigSchema,
}).omit({
  id: true,
  userId: true,
  triggerType: true, // derived from kind in core, not client-supplied
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
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [primaryKey({ columns: [table.userId, table.kind] })],
);

// ---------------------------------------------------------------------------
// Relations (drizzle query API)
// ---------------------------------------------------------------------------

export const ProfileRelations = relations(Profile, ({ one }) => ({
  user: one(user, { fields: [Profile.userId], references: [user.id] }),
}));

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
  user: one(user, { fields: [Habit.userId], references: [user.id] }),
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
