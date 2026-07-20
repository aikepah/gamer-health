/**
 * Deterministic seed for local dev and agent verification.
 *
 * Run with: pnpm db:seed (from the repo root; Postgres must be up).
 *
 * Each feature adds its own section below so every UI state is reachable
 * without manual setup. Keep inserts idempotent (delete-then-insert or
 * onConflictDoNothing) so the script can be re-run safely.
 */
import { randomBytes } from "node:crypto";
import { TZDate } from "@date-fns/tz";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

import type { CoachSpecialty } from "@gamer-health/validators";
import {
  ACHIEVEMENT_DEFS,
  BUILT_IN_HABIT_DEFINITIONS,
  REWARD_EVENT_DEFS,
  STREAK_KINDS,
} from "@gamer-health/validators";

import { db } from "./client";
import {
  AdminAuditLog,
  Checkin,
  CoachAvailability,
  CoachGame,
  CoachingRelationship,
  CoachInvite,
  CoachProfile,
  Game,
  GameSession,
  Habit,
  HabitDefinition,
  HabitPrompt,
  Profile,
  RewardEvent,
  Streak,
  user,
  UserAchievement,
} from "./schema";

export const DEMO_EMAIL = "demo@gamerhealth.dev";
const DEMO_PASSWORD = "demo1234";
const DEMO_NAME = "Demo Gamer";

const DEMO_ADMIN_EMAIL = "admin@gamerhealth.dev";
const DEMO_ADMIN_PASSWORD = "admin1234";
const DEMO_ADMIN_NAME = "Demo Admin";

const DEMO_COACH_EMAIL = "coach@gamerhealth.dev";
const DEMO_COACH_PASSWORD = "coach1234";
const DEMO_COACH_NAME = "Demo Coach";

// Second published coach (#9): discovery (#10) needs more than one result,
// and #11 needs a second coach to test multi-application.
const DEMO_COACH2_EMAIL = "coach2@gamerhealth.dev";
const DEMO_COACH2_PASSWORD = "coach2234";
const DEMO_COACH2_NAME = "Dana Whitfield";

// Third coach, deliberately left unpublished (#9): proves the publish gate
// from a fresh seed — full profile data, but excluded from discovery until
// someone flips `isPublished`.
const DEMO_COACH3_EMAIL = "coach3@gamerhealth.dev";
const DEMO_COACH3_PASSWORD = "coach3234";
const DEMO_COACH3_NAME = "Unlisted Coach";

// Minimal local Better Auth instance for seeding only. We can't import
// @gamer-health/auth here: it depends on @gamer-health/db, so importing it
// from this package would create a workspace cycle.
const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env.AUTH_SECRET ?? "seed-secret",
  baseURL: "http://localhost:3000",
  emailAndPassword: { enabled: true },
});

async function seedDemoUser() {
  const existing = await db.query.user.findFirst({
    where: eq(user.email, DEMO_EMAIL),
  });

  const demoUser =
    existing ??
    (
      await auth.api.signUpEmail({
        body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: DEMO_NAME },
      })
    ).user;

  const demoProfile = {
    timezone: "America/Chicago",
    platforms: ["PC", "Switch"],
    goals: "Game hard, stay healthy.",
  };
  await db
    .insert(Profile)
    .values({ userId: demoUser.id, ...demoProfile })
    .onConflictDoUpdate({
      target: Profile.userId,
      set: demoProfile,
    });

  return demoUser;
}

// --- Roles: demo admin + demo coach accounts, plus optional env-designated
// admin bootstrap (docs/features/roles-authorization.md). ------------------

async function seedRoleUser(
  email: string,
  password: string,
  name: string,
  role: "admin" | "coach",
) {
  const existing = await db.query.user.findFirst({
    where: eq(user.email, email),
  });

  const roleUser =
    existing ??
    (
      await auth.api.signUpEmail({
        body: { email, password, name },
      })
    ).user;

  await db
    .insert(Profile)
    .values({
      userId: roleUser.id,
      timezone: "America/Chicago",
      platforms: [],
      goals: null,
      role,
    })
    .onConflictDoUpdate({
      target: Profile.userId,
      set: { role, timezone: "America/Chicago", platforms: [] },
    });

  return roleUser.id;
}

async function seedRoles() {
  const adminId = await seedRoleUser(
    DEMO_ADMIN_EMAIL,
    DEMO_ADMIN_PASSWORD,
    DEMO_ADMIN_NAME,
    "admin",
  );
  const coachId = await seedRoleUser(
    DEMO_COACH_EMAIL,
    DEMO_COACH_PASSWORD,
    DEMO_COACH_NAME,
    "coach",
  );
  const coach2Id = await seedRoleUser(
    DEMO_COACH2_EMAIL,
    DEMO_COACH2_PASSWORD,
    DEMO_COACH2_NAME,
    "coach",
  );
  const coach3Id = await seedRoleUser(
    DEMO_COACH3_EMAIL,
    DEMO_COACH3_PASSWORD,
    DEMO_COACH3_NAME,
    "coach",
  );
  return { adminId, coachId, coach2Id, coach3Id };
}

// --- Coach invites (#6): one row per derived status, so every accept-page
// state (pending, expired, revoked, accepted) is reachable from a fresh seed.

const SEED_INVITE_EMAILS = [
  "pending-coach@gamerhealth.dev",
  "expired-coach@gamerhealth.dev",
  "revoked-coach@gamerhealth.dev",
  DEMO_COACH_EMAIL,
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedCoachInvites(adminId: string, coachId: string) {
  // Idempotency: wipe and reinsert these four rows by email.
  await db
    .delete(CoachInvite)
    .where(inArray(CoachInvite.email, [...SEED_INVITE_EMAILS]));

  const now = Date.now();

  await db.insert(CoachInvite).values([
    {
      // Fixed token: deterministic for tests/verification against a fresh seed.
      email: "pending-coach@gamerhealth.dev",
      token: "seed-pending-coach-invite-token",
      invitedByUserId: adminId,
      createdAt: new Date(now),
      expiresAt: new Date(now + 14 * DAY_MS),
    },
    {
      email: "expired-coach@gamerhealth.dev",
      token: randomBytes(24).toString("base64url"),
      invitedByUserId: adminId,
      createdAt: new Date(now - 30 * DAY_MS),
      expiresAt: new Date(now - 16 * DAY_MS),
    },
    {
      email: "revoked-coach@gamerhealth.dev",
      token: randomBytes(24).toString("base64url"),
      invitedByUserId: adminId,
      createdAt: new Date(now - 5 * DAY_MS),
      expiresAt: new Date(now + 14 * DAY_MS),
      revokedAt: new Date(now - 1 * DAY_MS),
    },
    {
      // Ties the seeded coach's origin story together.
      email: DEMO_COACH_EMAIL,
      token: randomBytes(24).toString("base64url"),
      invitedByUserId: adminId,
      createdAt: new Date(now - 10 * DAY_MS),
      expiresAt: new Date(now + 14 * DAY_MS),
      acceptedAt: new Date(now - 7 * DAY_MS),
      acceptedByUserId: coachId,
    },
  ]);
}

/**
 * Optional env-designated admin bootstrap: if `BOOTSTRAP_ADMIN_EMAIL` is set
 * and a user with that email already exists, upsert that profile's role to
 * `admin`. Does not create the user — this only elevates an existing account
 * (e.g. the person running the seed against their own dev login).
 */
async function bootstrapAdminFromEnv() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!email) {
    return;
  }

  const existing = await db.query.user.findFirst({
    where: eq(user.email, email),
  });
  if (!existing) {
    console.log(
      `BOOTSTRAP_ADMIN_EMAIL=${email} set but no matching user exists yet; skipping.`,
    );
    return;
  }

  await db
    .insert(Profile)
    .values({
      userId: existing.id,
      timezone: null,
      platforms: [],
      goals: null,
      role: "admin",
    })
    .onConflictDoUpdate({
      target: Profile.userId,
      set: { role: "admin" },
    });
  console.log(`Bootstrapped admin role for ${email}.`);
}

// --- Admin user management (#5): extra players (one deactivated) + a couple
// of admin audit log rows, so `/admin/users` has more than one row and its
// "Recent admin activity" panel is populated from a fresh seed. ------------

const PLAYER1_EMAIL = "player1@gamerhealth.dev";
const PLAYER1_NAME = "Riley Chen";
const PLAYER2_EMAIL = "player2@gamerhealth.dev";
const PLAYER2_NAME = "Sam Okafor";
const PLAYER3_EMAIL = "player3@gamerhealth.dev";
const PLAYER3_NAME = "Jordan Blake";
const EXTRA_PLAYER_PASSWORD = "demo1234";

async function seedExtraPlayer(
  email: string,
  name: string,
  deactivatedAt: Date | null,
) {
  const existing = await db.query.user.findFirst({
    where: eq(user.email, email),
  });

  const playerUser =
    existing ??
    (
      await auth.api.signUpEmail({
        body: { email, password: EXTRA_PLAYER_PASSWORD, name },
      })
    ).user;

  await db
    .insert(Profile)
    .values({
      userId: playerUser.id,
      timezone: "America/Chicago",
      platforms: [],
      goals: null,
      role: "player",
      deactivatedAt,
    })
    .onConflictDoUpdate({
      target: Profile.userId,
      set: { role: "player", deactivatedAt },
    });

  return playerUser.id;
}

async function seedExtraPlayers() {
  const player1Id = await seedExtraPlayer(PLAYER1_EMAIL, PLAYER1_NAME, null);
  const player2Id = await seedExtraPlayer(PLAYER2_EMAIL, PLAYER2_NAME, null);
  const player3Id = await seedExtraPlayer(
    PLAYER3_EMAIL,
    PLAYER3_NAME,
    chicagoLocal(2, 9, 0),
  );
  return { player1Id, player2Id, player3Id };
}

/**
 * One `role_change` (demo coach player -> coach) and one `user_deactivate`
 * (player3), both authored by the demo admin. Idempotency: wipe rows authored
 * by the demo admin and re-insert deterministically.
 */
async function seedAdminAuditLog(
  adminId: string,
  coachId: string,
  player3Id: string,
) {
  await db.delete(AdminAuditLog).where(eq(AdminAuditLog.actorUserId, adminId));

  await db.insert(AdminAuditLog).values([
    {
      actorUserId: adminId,
      targetUserId: coachId,
      action: "role_change",
      meta: { from: "player", to: "coach" },
      createdAt: chicagoLocal(5, 9, 0),
    },
    {
      actorUserId: adminId,
      targetUserId: player3Id,
      action: "user_deactivate",
      meta: {},
      createdAt: chicagoLocal(2, 9, 0),
    },
  ]);
}

// --- Session tracking: catalog + demo user's session history --------------

const CATALOG_GAMES = [
  { name: "Elden Ring", platform: "PC" },
  { name: "Baldur's Gate 3", platform: "PC" },
  { name: "Hades II", platform: "PC" },
  { name: "Stardew Valley", platform: "Switch" },
  { name: "Fortnite", platform: "PC" },
  { name: "League of Legends", platform: "PC" },
  { name: "Minecraft", platform: "PC" },
  { name: "Zelda: Tears of the Kingdom", platform: "Switch" },
  { name: "Rocket League", platform: "PC" },
  { name: "Cyberpunk 2077", platform: "PC" },
] as const;

interface SeedSession {
  game: (typeof CATALOG_GAMES)[number]["name"];
  /** Whole days before "now" the session started. */
  daysAgo: number;
  /** Local (America/Chicago) start hour/minute. */
  startHour: number;
  startMinute?: number;
  durationMinutes: number;
  notes?: string;
}

// 8-10 completed sessions over the last 14 days, varied games/durations, a
// couple with notes, and one ending after 23:00 local for dashboard interest.
const DEMO_SESSIONS: SeedSession[] = [
  { game: "Elden Ring", daysAgo: 13, startHour: 14, durationMinutes: 90 },
  { game: "Fortnite", daysAgo: 12, startHour: 19, durationMinutes: 45 },
  {
    game: "League of Legends",
    daysAgo: 11,
    startHour: 20,
    durationMinutes: 60,
    notes: "Ranked grind, went 3-2.",
  },
  { game: "Minecraft", daysAgo: 10, startHour: 16, durationMinutes: 120 },
  { game: "Stardew Valley", daysAgo: 8, startHour: 10, durationMinutes: 75 },
  {
    game: "Hades II",
    daysAgo: 6,
    startHour: 21,
    durationMinutes: 150,
    notes: "Almost beat the final boss!",
  },
  { game: "Rocket League", daysAgo: 4, startHour: 18, durationMinutes: 45 },
  // Starts 21:00, +150min -> ends 23:30 local.
  { game: "Cyberpunk 2077", daysAgo: 2, startHour: 21, durationMinutes: 150 },
  {
    game: "Baldur's Gate 3",
    daysAgo: 1,
    startHour: 13,
    durationMinutes: 180,
    notes: "Full campaign session with the squad.",
  },
];

/**
 * Fixed CDT (UTC-5) offset used only to give seed data demo-plausible local
 * times (e.g. the late-night Cyberpunk session). Not a general timezone
 * conversion — the app's local-day logic lives in core (see habit-engine).
 */
const CHICAGO_UTC_OFFSET_HOURS = 5;

function chicagoLocal(daysAgo: number, localHour: number, localMinute = 0) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(localHour + CHICAGO_UTC_OFFSET_HOURS, localMinute, 0, 0);
  return d;
}

async function seedSessionTracking(demoUserId: string) {
  await db
    .insert(Game)
    .values([...CATALOG_GAMES])
    .onConflictDoNothing();

  const games = await db.query.Game.findMany();
  const gameIdByName = new Map(games.map((g) => [g.name, g.id]));
  function gameId(name: string): string {
    const id = gameIdByName.get(name);
    if (!id) {
      throw new Error(`Seed game not found in catalog: ${name}`);
    }
    return id;
  }

  // Idempotency: wipe the demo user's sessions and re-insert deterministically.
  // (Cascades to habit_prompt/checkin rows referencing them.)
  await db.delete(GameSession).where(eq(GameSession.userId, demoUserId));

  const inserted = await db
    .insert(GameSession)
    .values(
      DEMO_SESSIONS.map((s) => {
        const startedAt = chicagoLocal(
          s.daysAgo,
          s.startHour,
          s.startMinute ?? 0,
        );
        const endedAt = new Date(
          startedAt.getTime() + s.durationMinutes * 60_000,
        );
        return {
          userId: demoUserId,
          gameId: gameId(s.game),
          startedAt,
          endedAt,
          source: "manual" as const,
          notes: s.notes ?? null,
        };
      }),
    )
    .returning();

  // DEMO_SESSIONS has no duplicate game names, so this 1:1 zip is safe and
  // relies on `returning()` preserving insert order.
  return new Map(
    DEMO_SESSIONS.map((s, i) => {
      const row = inserted[i];
      if (!row) {
        throw new Error(`Seed session insert missing a row for: ${s.game}`);
      }
      return [s.game, row] as const;
    }),
  );
}

// --- Coach profiles (#9): the demo coach + a second published coach + a
// third, deliberately unpublished coach, so discovery (#10) has more than one
// result and the publish gate is verifiable from a fresh seed. Runs after
// `seedSessionTracking` (CATALOG_GAMES must already exist). -----------------

interface SeedCoachProfileData {
  coachUserId: string;
  headline: string;
  bio: string;
  specialties: CoachSpecialty[];
  isPublished: boolean;
  gameNames: (typeof CATALOG_GAMES)[number]["name"][];
  availability: { weekday: number; startMinute: number; endMinute: number }[];
}

async function seedCoachProfile(data: SeedCoachProfileData) {
  await db
    .insert(CoachProfile)
    .values({
      userId: data.coachUserId,
      headline: data.headline,
      bio: data.bio,
      specialties: data.specialties,
      isPublished: data.isPublished,
      acceptingApplications: true,
    })
    .onConflictDoUpdate({
      target: CoachProfile.userId,
      set: {
        headline: data.headline,
        bio: data.bio,
        specialties: data.specialties,
        isPublished: data.isPublished,
        acceptingApplications: true,
      },
    });

  const games = await db.query.Game.findMany({
    where: inArray(Game.name, [...data.gameNames]),
  });
  const gameIdByName = new Map(games.map((g) => [g.name, g.id]));
  // Dedupe: a duplicate name in `gameNames` would insert the same
  // (coachUserId, gameId) twice and trip coach_game's PK.
  const gameIds = [...new Set(data.gameNames)].map((name) => {
    const id = gameIdByName.get(name);
    if (!id) {
      throw new Error(`Seed game not found in catalog: ${name}`);
    }
    return id;
  });

  // Idempotency: wipe this coach's games/availability and re-insert.
  await db.delete(CoachGame).where(eq(CoachGame.coachUserId, data.coachUserId));
  await db
    .insert(CoachGame)
    .values(
      gameIds.map((gameId) => ({ coachUserId: data.coachUserId, gameId })),
    );

  await db
    .delete(CoachAvailability)
    .where(eq(CoachAvailability.coachUserId, data.coachUserId));
  await db.insert(CoachAvailability).values(
    data.availability.map((block) => ({
      coachUserId: data.coachUserId,
      weekday: block.weekday,
      startMinute: block.startMinute,
      endMinute: block.endMinute,
    })),
  );
}

async function seedCoachProfiles(
  coachId: string,
  coach2Id: string,
  coach3Id: string,
) {
  // Demo Coach (coach@gamerhealth.dev): published, Mon/Wed/Fri evenings + Sat
  // late morning.
  await seedCoachProfile({
    coachUserId: coachId,
    headline: "Sleep and focus coaching for competitive gamers",
    bio: "Former collegiate esports player turned wellness coach. I help gamers build sustainable sleep and focus habits without sacrificing their grind.",
    specialties: ["Sleep", "Focus & Attention"],
    isPublished: true,
    gameNames: ["League of Legends", "Fortnite"],
    availability: [
      { weekday: 1, startMinute: 1020, endMinute: 1200 }, // Mon 17:00-20:00
      { weekday: 3, startMinute: 1020, endMinute: 1200 }, // Wed 17:00-20:00
      { weekday: 5, startMinute: 1020, endMinute: 1200 }, // Fri 17:00-20:00
      { weekday: 6, startMinute: 600, endMinute: 840 }, // Sat 10:00-14:00
    ],
  });

  // Dana Whitfield (coach2@gamerhealth.dev): published, Tue/Thu evenings.
  await seedCoachProfile({
    coachUserId: coach2Id,
    headline: "Screen-time balance and nutrition for casual + cozy gamers",
    bio: "I work with gamers who want to enjoy long play sessions without losing track of meals, movement, and screen-time balance.",
    specialties: ["Screen-Time Balance", "Nutrition"],
    isPublished: true,
    gameNames: ["Stardew Valley", "Minecraft"],
    availability: [
      { weekday: 2, startMinute: 1080, endMinute: 1260 }, // Tue 18:00-21:00
      { weekday: 4, startMinute: 1080, endMinute: 1260 }, // Thu 18:00-21:00
    ],
  });

  // Unlisted Coach (coach3@gamerhealth.dev): a complete profile, but left
  // unpublished — flipping `isPublished` should make it appear in discovery.
  await seedCoachProfile({
    coachUserId: coach3Id,
    headline: "Competitive performance coaching",
    bio: "Not yet accepting new players — profile kept unpublished on purpose.",
    specialties: ["Competitive Performance"],
    isPublished: false,
    gameNames: ["Elden Ring"],
    availability: [
      { weekday: 0, startMinute: 720, endMinute: 900 }, // Sun 12:00-15:00
    ],
  });
}

// --- Coach discovery & application (#10): seeded `applied` relationships so
// #11's coach roster has pending applications (and a multi-application case)
// on first load, with no manual setup. Runs after `seedCoachProfiles` (both
// coaches must exist) and `seedExtraPlayers` (both players must exist). -----

async function seedCoachApplications(
  player1Id: string,
  player2Id: string,
  coachId: string,
  coach2Id: string,
) {
  // Idempotency: wipe exactly these seeded (player, coach) pairs, then
  // re-insert — a plain upsert can't target this table's partial unique
  // indexes, and re-running should always land on the same three rows.
  await db.delete(CoachingRelationship).where(
    or(
      and(
        eq(CoachingRelationship.playerUserId, player1Id),
        eq(CoachingRelationship.coachUserId, coachId),
      ),
      and(
        eq(CoachingRelationship.playerUserId, player2Id),
        eq(CoachingRelationship.coachUserId, coachId),
      ),
      and(
        eq(CoachingRelationship.playerUserId, player2Id),
        eq(CoachingRelationship.coachUserId, coach2Id),
      ),
    ),
  );

  await db.insert(CoachingRelationship).values([
    {
      // Riley Chen -> Demo Coach: the single pending application #11 shows
      // on first load.
      playerUserId: player1Id,
      coachUserId: coachId,
      status: "applied",
      initiatedByUserId: player1Id,
      message:
        "Hi! I've been struggling to wind down after late-night ranked sessions — would love help building a sleep routine.",
    },
    {
      // Sam Okafor -> Demo Coach AND Dana Whitfield: the multi-application
      // case (#10's discovery lets a player shop more than one coach) and
      // #11's auto-decline-the-others path once one of these is accepted.
      playerUserId: player2Id,
      coachUserId: coachId,
      status: "applied",
      initiatedByUserId: player2Id,
      message:
        "Looking for help balancing long Stardew/Minecraft sessions with the rest of my life.",
    },
    {
      playerUserId: player2Id,
      coachUserId: coach2Id,
      status: "applied",
      initiatedByUserId: player2Id,
      message: "Interested in your screen-time balance coaching!",
    },
  ]);
}

// --- Admin content management (#7): games-catalog curation demo data + one
// admin-created default habit definition. -----------------------------------

const TYPO_GAME_NAME = "Rocket Leage"; // typo dupe of "Rocket League" (merge demo)
const DELETE_DEMO_GAME_NAME = "elden ring (steam)"; // zero-session (delete demo)
const ADMIN_HABIT_DEF_TITLE = "Eat a real meal";

/**
 * Must run AFTER `seedHabitEngine` (called from `seed()` below): this
 * section's delete-then-insert of the admin-created definition would trip
 * the `habit.definition_id` FK if the demo user still had a stale instance
 * from a previous run — `seedHabitEngine` wipes/re-seeds the demo user's own
 * Habit rows first, so by the time this runs there's nothing referencing it.
 */
async function seedAdminContentDemo(adminId: string, player1Id: string) {
  await db
    .insert(Game)
    .values([
      { name: TYPO_GAME_NAME, platform: "PC" },
      { name: DELETE_DEMO_GAME_NAME, platform: null },
    ])
    .onConflictDoNothing();

  const typoGame = await db.query.Game.findFirst({
    where: eq(Game.name, TYPO_GAME_NAME),
  });
  if (!typoGame) {
    throw new Error(`Seed game not found in catalog: ${TYPO_GAME_NAME}`);
  }

  // Idempotency: wipe player1's sessions on the typo game and re-insert one
  // completed retro session (merge demo: this session should end up under
  // "Rocket League" once an admin merges the two catalog rows).
  await db
    .delete(GameSession)
    .where(
      and(
        eq(GameSession.userId, player1Id),
        eq(GameSession.gameId, typoGame.id),
      ),
    );
  const startedAt = chicagoLocal(3, 19, 0);
  await db.insert(GameSession).values({
    userId: player1Id,
    gameId: typoGame.id,
    startedAt,
    endedAt: new Date(startedAt.getTime() + 45 * 60_000),
    source: "manual",
    notes: null,
  });

  // Idempotency: delete-then-insert the admin-created default definition
  // (scoped to slug IS NULL so this never touches the built-in catalog).
  await db
    .delete(HabitDefinition)
    .where(
      and(
        isNull(HabitDefinition.slug),
        eq(HabitDefinition.title, ADMIN_HABIT_DEF_TITLE),
      ),
    );
  await db.insert(HabitDefinition).values({
    slug: null,
    title: ADMIN_HABIT_DEF_TITLE,
    description: "Step away and eat something that isn't a snack.",
    promptText: "Time for a real meal",
    triggerType: "daily_schedule",
    defaultConfig: { timeOfDay: "12:30" },
    isDefault: true,
    createdByUserId: adminId,
  });
}

// --- Habit catalog: built-in habit definitions (idempotent upsert by slug) -

/**
 * Upserts the six built-in habit definitions from
 * @gamer-health/validators' BUILT_IN_HABIT_DEFINITIONS (the single source of
 * truth for built-in habit data — see docs/features/habit-generalization.md)
 * and returns their ids keyed by slug for the habit-engine section below.
 */
async function seedHabitDefinitions(): Promise<Map<string, string>> {
  await db
    .insert(HabitDefinition)
    .values(
      BUILT_IN_HABIT_DEFINITIONS.map((d) => ({
        ...d,
        defaultConfig: { ...d.defaultConfig },
        isDefault: true,
        createdByUserId: null,
      })),
    )
    .onConflictDoNothing({ target: HabitDefinition.slug });

  const rows = await db.query.HabitDefinition.findMany({
    where: inArray(
      HabitDefinition.slug,
      BUILT_IN_HABIT_DEFINITIONS.map((d) => d.slug),
    ),
  });
  return new Map(rows.map((r) => [r.slug ?? "", r.id]));
}

// --- Habit engine: demo user's habits + representative historical prompts -

type SeedGameSession = NonNullable<
  Awaited<ReturnType<typeof seedSessionTracking>> extends Map<string, infer V>
    ? V
    : never
>;

type SeedPromptStatus = "done" | "skipped" | "expired";

/** Built-in habits enabled for the demo user, with their default configs. */
const DEMO_ENABLED_HABITS = [
  {
    slug: "break_interval",
    config: { intervalMinutes: 50 },
  },
  {
    slug: "hydrate",
    config: { intervalMinutes: 30 },
  },
  {
    slug: "daily_movement",
    config: { timeOfDay: "17:00" },
  },
  {
    slug: "bedtime_cutoff",
    config: { bedtime: "23:00", leadMinutes: 60 },
  },
];

// Long-enough past sessions (>=150min) to plausibly have generated both a
// break_interval (+50min) and two hydrate (+30min, +60min) prompts, with a
// mix of statuses across the three (done/skipped/expired each appear).
const INTERVAL_PROMPT_SESSIONS: {
  game: (typeof CATALOG_GAMES)[number]["name"];
  statuses: [SeedPromptStatus, SeedPromptStatus, SeedPromptStatus];
}[] = [
  { game: "Hades II", statuses: ["done", "done", "skipped"] },
  { game: "Cyberpunk 2077", statuses: ["skipped", "done", "expired"] },
  { game: "Baldur's Gate 3", statuses: ["expired", "skipped", "done"] },
];

// 3 past daily_movement prompts on distinct days, sessionId null.
const DAILY_MOVEMENT_PROMPTS: {
  daysAgo: number;
  status: "done" | "expired";
}[] = [
  { daysAgo: 7, status: "done" },
  { daysAgo: 5, status: "done" },
  { daysAgo: 3, status: "expired" },
];

async function seedHabitEngine(
  demoUserId: string,
  sessionsByGame: Map<string, SeedGameSession>,
  definitionIdBySlug: Map<string, string>,
) {
  // Cascades to this user's habit_prompt rows (habitId FK, onDelete cascade).
  await db.delete(Habit).where(eq(Habit.userId, demoUserId));

  function definitionId(slug: string): string {
    const id = definitionIdBySlug.get(slug);
    if (!id) {
      throw new Error(`Seed habit definition not found: ${slug}`);
    }
    return id;
  }

  const habitRows = await db
    .insert(Habit)
    .values(
      DEMO_ENABLED_HABITS.map((h) => ({
        userId: demoUserId,
        definitionId: definitionId(h.slug),
        enabled: true,
        config: h.config,
      })),
    )
    .returning();

  const slugByDefinitionId = new Map(
    Array.from(definitionIdBySlug.entries()).map(([slug, id]) => [id, slug]),
  );
  const habitIdBySlug = new Map<string, string>(
    habitRows.map((h) => [slugByDefinitionId.get(h.definitionId) ?? "", h.id]),
  );
  function habitId(slug: string): string {
    const id = habitIdBySlug.get(slug);
    if (!id) {
      throw new Error(`Seed habit not found: ${slug}`);
    }
    return id;
  }

  function sessionFor(game: string): SeedGameSession {
    const session = sessionsByGame.get(game);
    if (!session) {
      throw new Error(`Seed session not found for habit prompts: ${game}`);
    }
    return session;
  }

  const minutes = (n: number) => n * 60_000;
  function respondedAtFor(
    status: SeedPromptStatus,
    dueAt: Date,
    offsetMinutes: number,
  ) {
    return status === "expired"
      ? null
      : new Date(dueAt.getTime() + minutes(offsetMinutes));
  }

  interface SeedHabitPrompt {
    habitId: string;
    userId: string;
    sessionId: string | null;
    dueAt: Date;
    status: SeedPromptStatus;
    respondedAt: Date | null;
  }

  const prompts: SeedHabitPrompt[] = [];

  for (const { game, statuses } of INTERVAL_PROMPT_SESSIONS) {
    const session = sessionFor(game);
    const [breakStatus, hydrate1Status, hydrate2Status] = statuses;

    const breakDueAt = new Date(session.startedAt.getTime() + minutes(50));
    prompts.push({
      habitId: habitId("break_interval"),
      userId: demoUserId,
      sessionId: session.id,
      dueAt: breakDueAt,
      status: breakStatus,
      respondedAt: respondedAtFor(breakStatus, breakDueAt, 2),
    });

    const hydrate1DueAt = new Date(session.startedAt.getTime() + minutes(30));
    prompts.push({
      habitId: habitId("hydrate"),
      userId: demoUserId,
      sessionId: session.id,
      dueAt: hydrate1DueAt,
      status: hydrate1Status,
      respondedAt: respondedAtFor(hydrate1Status, hydrate1DueAt, 2),
    });

    const hydrate2DueAt = new Date(session.startedAt.getTime() + minutes(60));
    prompts.push({
      habitId: habitId("hydrate"),
      userId: demoUserId,
      sessionId: session.id,
      dueAt: hydrate2DueAt,
      status: hydrate2Status,
      respondedAt: respondedAtFor(hydrate2Status, hydrate2DueAt, 3),
    });
  }

  for (const { daysAgo, status } of DAILY_MOVEMENT_PROMPTS) {
    const dueAt = chicagoLocal(daysAgo, 17, 0);
    prompts.push({
      habitId: habitId("daily_movement"),
      userId: demoUserId,
      sessionId: null,
      dueAt,
      status,
      respondedAt: respondedAtFor(status, dueAt, 10),
    });
  }

  return db.insert(HabitPrompt).values(prompts).returning();
}

// --- Check-ins: demo user's daily + post_session history. None dated today
// so the home page's "Daily check-in" card is visible from a fresh seed. ---

interface SeedDailyCheckin {
  /** Whole days before "now" (local America/Chicago date). */
  daysAgo: number;
  mood: number;
  energy?: number;
  sleepQuality?: number;
  note?: string;
  hour?: number;
}

// 9 daily check-ins over the last 14 days (never daysAgo: 0 — see above),
// varying mood/energy/sleepQuality, with a couple of notes.
const DEMO_DAILY_CHECKINS: SeedDailyCheckin[] = [
  {
    daysAgo: 13,
    mood: 2,
    energy: 2,
    sleepQuality: 2,
    note: "Rough day, low energy.",
    hour: 9,
  },
  { daysAgo: 12, mood: 3, energy: 3, sleepQuality: 3, hour: 9 },
  { daysAgo: 11, mood: 4, energy: 3, sleepQuality: 4, hour: 8 },
  { daysAgo: 10, mood: 3, energy: 4, sleepQuality: 3, hour: 9 },
  { daysAgo: 9, mood: 4, energy: 4, sleepQuality: 4, hour: 8 },
  {
    daysAgo: 7,
    mood: 5,
    energy: 5,
    sleepQuality: 5,
    note: "Felt great after a full night's sleep!",
    hour: 8,
  },
  { daysAgo: 6, mood: 4, energy: 3, sleepQuality: 4, hour: 9 },
  { daysAgo: 4, mood: 3, energy: 2, sleepQuality: 3, hour: 9 },
  { daysAgo: 3, mood: 4, energy: 4, sleepQuality: 4, hour: 8 },
];

interface SeedPostSessionCheckin {
  game: (typeof CATALOG_GAMES)[number]["name"];
  mood: number;
  energy?: number;
  note?: string;
}

// 3 post_session check-ins linked to seeded sessions, mood loosely inversely
// correlated with session length (longer session -> more fatigue) for an
// interesting dashboard playtime-vs-mood chart later.
const DEMO_POST_SESSION_CHECKINS: SeedPostSessionCheckin[] = [
  {
    game: "Rocket League", // 45min session
    mood: 5,
    energy: 4,
    note: "Quick match, felt sharp.",
  },
  {
    game: "Hades II", // 150min session
    mood: 3,
    energy: 2,
  },
  {
    game: "Baldur's Gate 3", // 180min session
    mood: 2,
    energy: 2,
    note: "Long session, pretty drained.",
  },
];

async function seedCheckins(
  demoUserId: string,
  sessionsByGame: Map<string, SeedGameSession>,
) {
  // Idempotency: wipe the demo user's check-ins and re-insert deterministically.
  await db.delete(Checkin).where(eq(Checkin.userId, demoUserId));

  const dailyRows = DEMO_DAILY_CHECKINS.map((c) => ({
    userId: demoUserId,
    context: "daily" as const,
    sessionId: null,
    mood: c.mood,
    energy: c.energy ?? null,
    sleepQuality: c.sleepQuality ?? null,
    note: c.note ?? null,
    createdAt: chicagoLocal(c.daysAgo, c.hour ?? 9, 0),
  }));

  const postSessionRows = DEMO_POST_SESSION_CHECKINS.map((c) => {
    const session = sessionsByGame.get(c.game);
    if (!session?.endedAt) {
      throw new Error(`Seed session not found for check-in: ${c.game}`);
    }
    return {
      userId: demoUserId,
      context: "post_session" as const,
      sessionId: session.id,
      mood: c.mood,
      energy: c.energy ?? null,
      sleepQuality: null,
      note: c.note ?? null,
      createdAt: new Date(session.endedAt.getTime() + 5 * 60_000),
    };
  });

  return db
    .insert(Checkin)
    .values([...dailyRows, ...postSessionRows])
    .returning();
}

// --- Gamification: XP ledger backfilled from the sections above, plus a
// couple of explicit demo streaks and achievement unlocks. Seed can't import
// @gamer-health/core (dependency cycle), so this inserts `reward_event` /
// `streak` / `user_achievement` rows directly from the
// @gamer-health/validators taxonomy constants instead of running the real
// engine (docs/features/gamification.md). --------------------------------

/**
 * The actual "YYYY-MM-DD" wall-clock date in America/Chicago right now.
 * Unlike `chicagoLocal` (a fixed-offset approximation used elsewhere in this
 * file for demo-plausible historical timestamps), the streak
 * `lastActivityDate` this feeds must match what `recordRewardEvent`'s real
 * `localDateString(now, "America/Chicago")` computes — otherwise a check-in
 * right after a fresh seed could see a bogus gap/consecutive-day result. Uses
 * `@date-fns/tz` directly (not `@gamer-health/core`, to avoid the db->core
 * dependency cycle) for real IANA tz math.
 */
function chicagoToday(): string {
  const zoned = new TZDate(new Date(), "America/Chicago");
  const year = zoned.getFullYear();
  const month = String(zoned.getMonth() + 1).padStart(2, "0");
  const day = String(zoned.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DEMO_STREAKS: Record<
  (typeof STREAK_KINDS)[number],
  { current: number; longest: number }
> = {
  daily_checkin: { current: 3, longest: 5 },
  daily_habit: { current: 2, longest: 4 },
  habit_hydrate: { current: 1, longest: 3 },
};

async function seedGamification(
  demoUserId: string,
  sessions: SeedGameSession[],
  prompts: (typeof HabitPrompt.$inferSelect)[],
  checkins: (typeof Checkin.$inferSelect)[],
) {
  // Idempotency: wipe and rebuild the demo user's XP ledger, streaks, and
  // achievement unlocks from the seeded sessions/prompts/check-ins.
  await db.delete(RewardEvent).where(eq(RewardEvent.userId, demoUserId));
  await db.delete(Streak).where(eq(Streak.userId, demoUserId));
  await db
    .delete(UserAchievement)
    .where(eq(UserAchievement.userId, demoUserId));

  // Every seeded session is completed (`endedAt` set) -> one session_logged each.
  const sessionEvents = sessions.map((s) => {
    if (!s.endedAt) {
      throw new Error(`Seed session ${s.id} has no endedAt`);
    }
    return {
      userId: demoUserId,
      eventType: "session_logged",
      xp: REWARD_EVENT_DEFS.session_logged.xp,
      sourceKind: REWARD_EVENT_DEFS.session_logged.sourceKind,
      sourceId: s.id,
      createdAt: s.endedAt,
    };
  });

  const promptEvents = prompts
    .filter((p) => p.status === "done")
    .map((p) => ({
      userId: demoUserId,
      eventType: "habit_prompt_completed",
      xp: REWARD_EVENT_DEFS.habit_prompt_completed.xp,
      sourceKind: REWARD_EVENT_DEFS.habit_prompt_completed.sourceKind,
      sourceId: p.id,
      createdAt: p.respondedAt ?? p.dueAt,
    }));

  const checkinEvents = checkins.map((c) => ({
    userId: demoUserId,
    eventType: "checkin_completed",
    xp: REWARD_EVENT_DEFS.checkin_completed.xp,
    sourceKind: REWARD_EVENT_DEFS.checkin_completed.sourceKind,
    sourceId: c.id,
    createdAt: c.createdAt,
  }));

  const earliest = (dates: Date[]) =>
    dates.reduce((min, d) => (d < min ? d : min));
  const firstSessionAt = earliest(sessionEvents.map((e) => e.createdAt));
  const firstCheckinAt = earliest(checkinEvents.map((e) => e.createdAt));

  const achievementEvents = [
    {
      userId: demoUserId,
      eventType: "achievement_unlocked",
      xp: ACHIEVEMENT_DEFS.first_session.xp,
      sourceKind: REWARD_EVENT_DEFS.achievement_unlocked.sourceKind,
      sourceId: "first_session",
      createdAt: firstSessionAt,
    },
    {
      userId: demoUserId,
      eventType: "achievement_unlocked",
      xp: ACHIEVEMENT_DEFS.first_checkin.xp,
      sourceKind: REWARD_EVENT_DEFS.achievement_unlocked.sourceKind,
      sourceId: "first_checkin",
      createdAt: firstCheckinAt,
    },
  ];

  await db
    .insert(RewardEvent)
    .values([
      ...sessionEvents,
      ...promptEvents,
      ...checkinEvents,
      ...achievementEvents,
    ]);

  await db.insert(UserAchievement).values([
    {
      userId: demoUserId,
      achievementKey: "first_session",
      unlockedAt: firstSessionAt,
    },
    {
      userId: demoUserId,
      achievementKey: "first_checkin",
      unlockedAt: firstCheckinAt,
    },
  ]);

  const today = chicagoToday();
  await db.insert(Streak).values(
    STREAK_KINDS.map((kind) => ({
      userId: demoUserId,
      kind,
      current: DEMO_STREAKS[kind].current,
      longest: DEMO_STREAKS[kind].longest,
      lastActivityDate: today,
    })),
  );
}

async function seed() {
  // --- Phase 1: demo user (via Better Auth API) + profile. Later feature
  // sections resolve the demo user id by selecting on DEMO_EMAIL. ---
  const demoUser = await seedDemoUser();

  // --- Roles: demo admin + demo coach accounts (demo user stays a player) ---
  const { adminId, coachId, coach2Id, coach3Id } = await seedRoles();
  await bootstrapAdminFromEnv();

  // --- Habit catalog: built-in habit definitions (upsert by slug) ---
  const definitionIdBySlug = await seedHabitDefinitions();
  // --- Coach invites (#6): pending/expired/revoked/accepted rows ---
  await seedCoachInvites(adminId, coachId);

  // --- Admin user management (#5): extra players + admin audit log rows ---
  const { player1Id, player2Id, player3Id } = await seedExtraPlayers();
  await seedAdminAuditLog(adminId, coachId, player3Id);

  // --- Session tracking: catalog + demo user's session history ---
  const sessionsByGame = await seedSessionTracking(demoUser.id);

  // --- Coach profiles (#9): demo coach + a second published coach + a third,
  // unpublished coach. Runs after seedSessionTracking (needs CATALOG_GAMES).
  await seedCoachProfiles(coachId, coach2Id, coach3Id);

  // --- Coach discovery & application (#10): seeded `applied` relationships.
  await seedCoachApplications(player1Id, player2Id, coachId, coach2Id);

  // --- Habit engine: demo user's habits + representative historical prompts
  const prompts = await seedHabitEngine(
    demoUser.id,
    sessionsByGame,
    definitionIdBySlug,
  );

  // --- Admin content management (#7): games-catalog curation demo data +
  // one admin-created default habit definition. Runs after the habit engine
  // section above (which wipes/re-seeds the demo user's own Habit rows) so
  // this section's delete-then-insert of the admin-created definition never
  // trips the habit_definition_id FK against a stale demo-user instance. ---
  await seedAdminContentDemo(adminId, player1Id);

  // --- Check-ins: demo user's daily + post_session check-in history ---
  const checkins = await seedCheckins(demoUser.id, sessionsByGame);

  // --- Gamification: XP ledger + streaks + achievement unlocks ---
  await seedGamification(
    demoUser.id,
    Array.from(sessionsByGame.values()),
    prompts,
    checkins,
  );

  console.log("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
