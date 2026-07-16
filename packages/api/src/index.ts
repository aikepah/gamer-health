import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "./root";

/**
 * Inference helpers for input types
 * @example
 * type LogSessionInput = RouterInputs['gameSession']['log']
 *      ^? { gameId: string; startedAt: Date; ... }
 */
type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helpers for output types
 * @example
 * type SummaryOutput = RouterOutputs['gamification']['summary']
 *      ^? { totalXp: number; level: number; ... }
 */
type RouterOutputs = inferRouterOutputs<AppRouter>;

export { type AppRouter, appRouter } from "./root";
export { createTRPCContext } from "./trpc";
export type { RouterInputs, RouterOutputs };
