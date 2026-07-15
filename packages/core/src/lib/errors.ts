/**
 * Domain-level errors thrown by `packages/core` services.
 *
 * Core services never import tRPC — they throw `CoreError`, and
 * `packages/api` maps it to a `TRPCError` with a matching code (see
 * `toServiceCtx` / the CoreError-mapping middleware in `packages/api/src/trpc.ts`).
 */
export type CoreErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BAD_REQUEST";

export class CoreError extends Error {
  public code: CoreErrorCode;

  constructor(code: CoreErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "CoreError";
  }
}
