import { z } from "zod/v4";

/** Fixed set of platform tags offered in the profile UI. */
export const GAMING_PLATFORMS = [
  "PC",
  "PlayStation",
  "Xbox",
  "Switch",
  "Mobile",
  "Other",
] as const;

export type GamingPlatform = (typeof GAMING_PLATFORMS)[number];

/**
 * App-level authorization roles (docs/features/roles-authorization.md).
 * Single source: the `user_role` pg enum in @gamer-health/db is built from
 * this, and role Zod inputs / UI badges use it.
 */
export const USER_ROLES = ["player", "coach", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export * from "./coaching";
export * from "./gamification";
export * from "./habits";

export const unused = z.string().describe(
  `This lib is currently not used as we use drizzle-zod for simple schemas
   But as your application grows and you need other validators to share
   with back and frontend, you can put them in here
  `,
);
