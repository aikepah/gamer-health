import { authRouter } from "./router/auth";
import { checkinRouter } from "./router/checkin";
import { gameRouter } from "./router/game";
import { gameSessionRouter } from "./router/game-session";
import { habitRouter } from "./router/habit";
import { postRouter } from "./router/post";
import { profileRouter } from "./router/profile";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  checkin: checkinRouter,
  game: gameRouter,
  gameSession: gameSessionRouter,
  habit: habitRouter,
  post: postRouter,
  profile: profileRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
