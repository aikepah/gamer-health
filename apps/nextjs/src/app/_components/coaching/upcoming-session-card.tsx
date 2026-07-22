"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";

/**
 * Dashboard widget (#15): the caller's single soonest upcoming coaching
 * session (proposed or confirmed), or a prompt to schedule one. Reuses
 * `coaching.sessions.list` — the same query backing `/coaching/sessions` and
 * `/coach/sessions` — so there's no separate "next session" service.
 *
 * Fetches its own data (same pattern as `MyCoachCard`/`PlayerStatsCard`) so
 * it can be dropped in without prop plumbing. Only meaningful once the
 * player has an active coach — the dashboard only renders this alongside
 * `MyCoachCard`'s "has a coach" state.
 */
export function UpcomingSessionCard() {
  const trpc = useTRPC();
  const { data: upcoming } = useQuery(
    trpc.coaching.sessions.list.queryOptions({ scope: "upcoming", limit: 1 }),
  );

  if (upcoming === undefined) {
    return (
      <div className="border-border w-full max-w-md rounded-lg border p-4">
        <div className="bg-muted h-16 w-full animate-pulse rounded" />
      </div>
    );
  }

  const next = upcoming[0];

  return (
    <div className="border-border w-full max-w-md rounded-lg border p-4">
      <p className="font-semibold">Next session</p>
      {next ? (
        <>
          <p className="mt-1 text-sm">
            {new Date(next.startsAt).toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
          <p className="text-muted-foreground text-xs">
            {next.status === "proposed"
              ? "Waiting on your coach to confirm"
              : "Confirmed"}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground mt-1 text-sm">
          Nothing scheduled yet.
        </p>
      )}
      <Link
        href={next ? "/coaching/sessions" : "/coaching/sessions/schedule"}
        className="text-primary mt-2 inline-block text-sm font-medium underline-offset-4 hover:underline"
      >
        {next ? "View sessions" : "Schedule a session"}
      </Link>
    </div>
  );
}
