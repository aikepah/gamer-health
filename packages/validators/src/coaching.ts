/**
 * Coaching domain constants (MVP 2 wave 2, issues #9–#15).
 *
 * These are the single source of truth for the coaching pg enums in
 * @gamer-health/db (packages/db/src/schema.ts builds `coaching_relationship_status`,
 * `coaching_session_status` and `goal_status` from these arrays), and are
 * reused for Zod inputs and UI badges — same pattern as `USER_ROLES`.
 *
 * NOTE: pg enum values are append-only. Add new values at the END of these
 * arrays, never in the middle.
 */

/**
 * Lifecycle of a player↔coach coaching relationship
 * (docs/features/coaching-relationships.md, #11).
 *
 * - `applied`  — player applied via discovery (#10); awaiting the coach.
 * - `active`   — coach accepted. THE state `assertCoachOf` keys on.
 * - `declined`  — coach declined, or auto-declined because the player started
 *                 coaching with someone else. Terminal.
 * - `ended`     — was active, then ended by either side. Terminal.
 * - `withdrawn` — player pulled their own application before a response.
 *                 Terminal. Distinct from `declined` so "coaches who turned
 *                 me down" stays meaningful.
 *
 * A future subscription/payment gate would append a `pending_payment` value
 * here and gate the applied→active transition; nothing is built for it now.
 */
export const COACHING_RELATIONSHIP_STATUSES = [
  "applied",
  "active",
  "declined",
  "ended",
  "withdrawn",
] as const;
export type CoachingRelationshipStatus =
  (typeof COACHING_RELATIONSHIP_STATUSES)[number];

/** Relationship statuses that block a new application to the same coach. */
export const OPEN_COACHING_RELATIONSHIP_STATUSES = [
  "applied",
  "active",
] as const;

/**
 * Lifecycle of a scheduled coaching appointment
 * (docs/features/coaching-sessions.md, #15).
 *
 * There is deliberately no `declined` value: a coach declining a proposal is
 * a `cancelled` row with `confirmedAt IS NULL`; a cancellation after
 * confirmation has `confirmedAt` set. `cancelledByUserId` says who did it.
 */
export const COACHING_SESSION_STATUSES = [
  "proposed",
  "confirmed",
  "cancelled",
  "completed",
] as const;
export type CoachingSessionStatus = (typeof COACHING_SESSION_STATUSES)[number];

/** Goal lifecycle (docs/features/goals.md, #13). */
export const GOAL_STATUSES = ["open", "completed", "abandoned"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/**
 * Closed set of coach specialty tags, stored as `text[]` on `coach_profile`
 * (same shape as `profile.platforms`). Closed rather than free text so
 * discovery (#10) can filter on exact values with no normalization step.
 */
export const COACH_SPECIALTIES = [
  "Sleep",
  "Nutrition",
  "Fitness",
  "Posture & Ergonomics",
  "Focus & Attention",
  "Stress & Anxiety",
  "Screen-Time Balance",
  "Competitive Performance",
] as const;
export type CoachSpecialty = (typeof COACH_SPECIALTIES)[number];

/**
 * Weekday numbering for `coach_availability.weekday`: 0 = Sunday … 6 =
 * Saturday, matching JavaScript's `Date#getDay()`.
 */
export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Minutes in a day — the exclusive upper bound for availability endMinute. */
export const MINUTES_PER_DAY = 1440;
