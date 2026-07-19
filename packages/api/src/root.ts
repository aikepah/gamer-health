import { adminRouter } from "./router/admin";
import { authRouter } from "./router/auth";
import { checkinRouter } from "./router/checkin";
import { coachingRouter } from "./router/coaching";
import { dashboardRouter } from "./router/dashboard";
import { gameRouter } from "./router/game";
import { gameSessionRouter } from "./router/game-session";
import { gamificationRouter } from "./router/gamification";
import { habitRouter } from "./router/habit";
import { inviteRouter } from "./router/invite";
import { profileRouter } from "./router/profile";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  admin: adminRouter,
  auth: authRouter,
  checkin: checkinRouter,
  coaching: coachingRouter,
  dashboard: dashboardRouter,
  game: gameRouter,
  gameSession: gameSessionRouter,
  gamification: gamificationRouter,
  habit: habitRouter,
  invite: inviteRouter,
  profile: profileRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
