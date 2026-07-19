import { createTRPCRouter } from "../../trpc";
import { profileRouter } from "./profile";

/**
 * Coaching router skeleton (MVP 2 wave 2, #9). #10–#15 each add one key here
 * (`discovery`, `relationships`, `players`, `goals`, `assignedHabits`,
 * `sessions`) in their own file — keeping additions to this single file is
 * what keeps their root.ts merges conflict-free, same as the `admin` router
 * in wave 1.
 */
export const coachingRouter = createTRPCRouter({
  profile: profileRouter,
});
