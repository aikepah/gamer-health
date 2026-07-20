import type { TRPCQueryOptions } from "@trpc/tanstack-react-query";
import { cache } from "react";
import { headers } from "next/headers";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";

import type { AppRouter, RouterOutputs } from "@gamer-health/api";
import type { Authz } from "@gamer-health/core";
import { appRouter, createTRPCContext } from "@gamer-health/api";

import { auth } from "~/auth/server";
import { createQueryClient } from "./query-client";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a tRPC call from a React Server Component.
 */
const createContext = cache(async () => {
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");

  return createTRPCContext({
    headers: heads,
    auth,
  });
});

/**
 * Server-side `profile.authz` fetch for RSC nav/layout guards that need the
 * result synchronously (not just prefetched for client hydration). Returns
 * `null` for unauthenticated or rejected (e.g. deactivated) callers — treat
 * `null` the same as "no access" rather than distinguishing the reason.
 */
export const getServerAuthz = cache(async (): Promise<Authz | null> => {
  const ctx = await createContext();
  if (!ctx.session?.user) {
    return null;
  }
  try {
    return await appRouter.createCaller(ctx).profile.authz();
  } catch {
    return null;
  }
});

/**
 * Server-side `invite.byToken` fetch for the public `/invite/[token]` page,
 * which needs to branch synchronously on unknown-vs-known tokens rather than
 * just prefetching for client hydration. Returns `null` for any unknown
 * token (the only error `byToken` throws is `NOT_FOUND`).
 */
export const getInviteByToken = cache(
  async (token: string): Promise<RouterOutputs["invite"]["byToken"] | null> => {
    const ctx = await createContext();
    try {
      return await appRouter.createCaller(ctx).invite.byToken({ token });
    } catch {
      return null;
    }
  },
);

/**
 * Server-side `coaching.profile.getPublic` fetch for `/coaches/[coachUserId]`,
 * which needs to branch synchronously into a 404 (`notFound()`) for an
 * unknown, unpublished, or deactivated coach rather than just prefetching for
 * client hydration. Any throw is treated as "not visible to this caller":
 * `NOT_FOUND` for an unknown/unpublished/deactivated coach, but also
 * `FORBIDDEN` if the *caller* is deactivated (`requireActiveUser`) — both
 * should render the same 404 rather than leak which case applies. Same
 * catch-all convention as `getInviteByToken` above.
 */
export const getPublicCoachProfileOrNull = cache(
  async (
    coachUserId: string,
  ): Promise<RouterOutputs["coaching"]["profile"]["getPublic"] | null> => {
    const ctx = await createContext();
    if (!ctx.session?.user) {
      return null;
    }
    try {
      return await appRouter
        .createCaller(ctx)
        .coaching.profile.getPublic({ coachUserId });
    } catch {
      return null;
    }
  },
);

const getQueryClient = cache(createQueryClient);

export const trpc = createTRPCOptionsProxy<AppRouter>({
  router: appRouter,
  ctx: createContext,
  queryClient: getQueryClient,
});

export function HydrateClient(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {props.children}
    </HydrationBoundary>
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prefetch<T extends ReturnType<TRPCQueryOptions<any>>>(
  queryOptions: T,
) {
  const queryClient = getQueryClient();
  if (queryOptions.queryKey[1]?.type === "infinite") {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    void queryClient.prefetchInfiniteQuery(queryOptions as any);
  } else {
    void queryClient.prefetchQuery(queryOptions);
  }
}
