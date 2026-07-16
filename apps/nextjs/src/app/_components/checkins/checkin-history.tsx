"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";

const CONTEXT_LABELS: Record<string, string> = {
  daily: "Daily",
  post_session: "Post-session",
};

/**
 * Compact "Recent check-ins" list for the home page (newest first). The
 * dashboard feature adds trend charts separately — this is just history.
 */
export function CheckinHistory() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.checkin.list.queryOptions({ limit: 10 }));

  if (!data || data.items.length === 0) {
    return null;
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <p className="text-muted-foreground text-sm font-medium">
        Recent check-ins
      </p>
      <ul className="flex flex-col gap-2">
        {data.items.map((checkin) => (
          <li
            key={checkin.id}
            className="border-border bg-card rounded-lg border p-3 text-sm"
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
              {checkin.energy !== null && (
                <span>Energy {checkin.energy}/5</span>
              )}
              {checkin.sleepQuality !== null && (
                <span>Sleep {checkin.sleepQuality}/5</span>
              )}
            </div>
            {checkin.note && <p className="mt-1">{checkin.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
