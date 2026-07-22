"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";

/**
 * Minimal shared header for the coach's player-detail page (#12/#13/#14).
 * Resolves the player's name/email from the existing active-roster query
 * (#11) rather than adding a new lookup — this page is only reachable for
 * an active roster player in the first place (every feature's panel here
 * gates on `assertCoachOf`, which requires the same active relationship).
 */
export function PlayerHeader({ playerUserId }: { playerUserId: string }) {
  const trpc = useTRPC();
  const { data: roster } = useQuery(
    trpc.coaching.relationships.roster.queryOptions({ status: "active" }),
  );

  const entry = roster?.find((r) => r.player.userId === playerUserId);

  return (
    <div className="mb-8">
      <h1 className="text-3xl font-bold tracking-tight">
        {entry?.player.name ?? "Player"}
      </h1>
      {entry?.player.email && (
        <p className="text-muted-foreground text-sm">{entry.player.email}</p>
      )}
    </div>
  );
}
