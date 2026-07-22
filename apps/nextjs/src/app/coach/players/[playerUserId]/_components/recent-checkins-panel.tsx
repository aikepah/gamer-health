"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@gamer-health/ui/button";

import { useTRPC } from "~/trpc/react";

const PAGE_SIZE = 10;

const CONTEXT_LABELS: Record<string, string> = {
  daily: "Daily",
  post_session: "Post-session",
};

/**
 * Paginated, read-only check-in history (mood/energy/sleep + free-text
 * notes) for a roster player (#12). Notes are included deliberately — they
 * are wellness content the player wrote while coached, and the point of
 * this feature (see docs/features/coach-player-tracking.md). Fetches via
 * `coaching.players.checkins`, which re-authorizes via `assertCoachOf` on
 * every page.
 */
export function RecentCheckinsPanel({
  playerUserId,
}: {
  playerUserId: string;
}) {
  const trpc = useTRPC();
  const [offset, setOffset] = useState(0);

  const { data } = useQuery(
    trpc.coaching.players.checkins.queryOptions({
      playerUserId,
      limit: PAGE_SIZE,
      offset,
    }),
  );

  return (
    <section className="border-border bg-card rounded-lg border p-4">
      <p className="mb-3 text-sm font-semibold">Recent check-ins</p>
      {!data ? (
        <div className="bg-muted h-32 w-full animate-pulse rounded" />
      ) : data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No check-ins yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((checkin) => (
            <li
              key={checkin.id}
              className="border-border rounded-lg border p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {new Date(checkin.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="bg-muted rounded-full px-2 py-0.5 text-xs">
                  {CONTEXT_LABELS[checkin.context] ?? checkin.context}
                  {checkin.session && ` · ${checkin.session.game.name}`}
                </span>
              </div>
              <div className="mt-1 flex gap-3">
                <span>Mood {checkin.mood}/5</span>
                {checkin.energy !== null && <span>Energy {checkin.energy}/5</span>}
                {checkin.sleepQuality !== null && (
                  <span>Sleep {checkin.sleepQuality}/5</span>
                )}
              </div>
              {checkin.note && <p className="mt-1">{checkin.note}</p>}
            </li>
          ))}
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
              ? "0 check-ins"
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
