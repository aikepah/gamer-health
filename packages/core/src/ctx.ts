import type { db } from "@gamer-health/db/client";

/**
 * Context passed to every domain service function.
 *
 * All business logic in this repo lives in `packages/core` as plain typed
 * functions of the shape `(ctx: ServiceCtx, input: Input) => Promise<Output>`,
 * with the Zod schema for `Input` exported alongside (or from
 * `@gamer-health/validators`). tRPC routers, background jobs, and the future
 * in-app AI assistant all call these same functions — never duplicate logic
 * in a router or component.
 */
export interface ServiceCtx {
  db: typeof db;
  /** Authenticated user id. Services that require auth should accept a ctx where this is set. */
  userId: string | null;
}

/**
 * The transaction-scoped variant of `ServiceCtx["db"]` — i.e. the `tx`
 * parameter inside `ctx.db.transaction(async (tx) => ...)`. `transaction`'s
 * own type param is the callback's *return* type, which the `tx` parameter
 * type doesn't depend on, so this double `Parameters<>` extraction resolves
 * to a concrete type regardless.
 */
export type TxDb = Parameters<
  Parameters<ServiceCtx["db"]["transaction"]>[0]
>[0];
