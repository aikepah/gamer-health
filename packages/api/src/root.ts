import { authRouter } from "./router/auth";
import { gameRouter } from "./router/game";
import { gameSessionRouter } from "./router/game-session";
import { habitRouter } from "./router/habit";
import { postRouter } from "./router/post";
import { profileRouter } from "./router/profile";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  game: gameRouter,
  gameSession: gameSessionRouter,
  habit: habitRouter,
  post: postRouter,
  profile: profileRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
