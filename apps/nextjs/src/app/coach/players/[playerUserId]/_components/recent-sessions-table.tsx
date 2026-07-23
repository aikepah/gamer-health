"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@gamer-health/ui/button";

import { formatDuration } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

const PAGE_SIZE = 10;

/**
 * Paginated, read-only session history for a roster player (#12) — same
 * shape as the player's own `/sessions` history, minus the edit/delete
 * controls (nothing on this page can mutate player data). Fetches via
 * `coaching.players.sessions`, which re-authorizes via `assertCoachOf` on
 * every page.
 */
export function RecentSessionsTable({
  playerUserId,
}: {
  playerUserId: string;
}) {
  const trpc = useTRPC();
  const [offset, setOffset] = useState(0);

  const { data } = useQuery(
    trpc.coaching.players.sessions.queryOptions({
      playerUserId,
      limit: PAGE_SIZE,
      offset,
    }),
  );

  return (
    <section className="border-border bg-card rounded-lg border p-4">
      <p className="mb-3 text-sm font-semibold">Recent sessions</p>
      {!data ? (
        <div className="bg-muted h-32 w-full animate-pulse rounded" />
      ) : data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No sessions logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((session) => {
            const durationMs = session.endedAt
              ? new Date(session.endedAt).getTime() -
                new Date(session.startedAt).getTime()
              : 0;
            return (
              <li
                key={session.id}
                className="flex items-start justify-between gap-4 rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">{session.game.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {new Date(session.startedAt).toLocaleString()} ·{" "}
                    {formatDuration(durationMs)}
                  </p>
                  {session.notes && (
                    <p className="mt-1 text-sm">{session.notes}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data && (
        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </Button>
          <p className="text-muted-foreground text-sm">
            {data.total === 0
              ? "0 sessions"
              : `${offset + 1}–${Math.min(offset + PAGE_SIZE, data.total)} of ${data.total}`}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + PAGE_SIZE >= data.total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      )}
    </section>
  );
}
