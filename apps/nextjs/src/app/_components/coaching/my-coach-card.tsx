"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { EndCoachingDialog } from "./end-coaching-dialog";

/**
 * "My coach" card (#11): the player's active relationship (coach name,
 * headline, since-date, End button), or — when there's no active coach — a
 * pending-applications summary linking to `/coaches`. Fetches its own data
 * so it can be dropped onto the dashboard without prop plumbing, same as
 * `PlayerStatsCard`.
 */
export function MyCoachCard() {
  const trpc = useTRPC();
  const { data: myCoach } = useQuery(
    trpc.coaching.relationships.myCoach.queryOptions(),
  );
  const { data: applications } = useQuery(
    trpc.coaching.discovery.myApplications.queryOptions(),
  );
  const [endOpen, setEndOpen] = useState(false);

  if (myCoach === undefined) {
    return (
      <div className="border-border w-full max-w-md rounded-lg border p-4">
        <div className="bg-muted h-20 w-full animate-pulse rounded" />
      </div>
    );
  }

  if (!myCoach) {
    const pendingCount =
      applications?.filter((a) => a.status === "applied").length ?? 0;
    return (
      <div className="border-border w-full max-w-md rounded-lg border p-4">
        <p className="font-semibold">My coach</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {pendingCount > 0
            ? `${pendingCount} application${pendingCount === 1 ? "" : "s"} pending`
            : "You don't have a coach yet."}
        </p>
        <Link
          href="/coaches"
          className="text-primary mt-2 inline-block text-sm font-medium underline-offset-4 hover:underline"
        >
          Find a coach
        </Link>
      </div>
    );
  }

  return (
    <div className="border-border w-full max-w-md rounded-lg border p-4">
      <p className="font-semibold">My coach</p>
      <p className="mt-1 text-lg font-semibold">{myCoach.coach.name}</p>
      {myCoach.coach.headline && (
        <p className="text-muted-foreground text-sm">
          {myCoach.coach.headline}
        </p>
      )}
      {myCoach.startedAt && (
        <p className="text-muted-foreground mt-1 text-xs">
          Coaching since {new Date(myCoach.startedAt).toLocaleDateString()}
        </p>
      )}
      <button
        type="button"
        className="text-destructive mt-3 text-sm font-medium underline-offset-4 hover:underline"
        onClick={() => setEndOpen(true)}
      >
        End coaching
      </button>

      <EndCoachingDialog
        relationshipId={myCoach.relationshipId}
        open={endOpen}
        onOpenChange={setEndOpen}
      />
    </div>
  );
}
