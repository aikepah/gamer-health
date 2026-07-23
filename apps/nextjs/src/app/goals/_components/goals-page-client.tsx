"use client";

import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { GoalRow } from "./goal-row";

/**
 * Player's own goals (#13, `/goals`). Ordering (open first, target date
 * ascending, overdue flagged) comes straight from `coaching.goals.listMine`
 * — no client-side re-sorting. Two distinct empty states: no coach at all
 * (points at `/coaches`) vs. a coach but no goals assigned yet.
 */
export function GoalsPageClient() {
  const trpc = useTRPC();
  const { data: goals } = useSuspenseQuery(
    trpc.coaching.goals.listMine.queryOptions({}),
  );
  const { data: myCoach } = useSuspenseQuery(
    trpc.coaching.relationships.myCoach.queryOptions(),
  );

  if (goals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        {myCoach ? (
          <p className="text-muted-foreground text-sm">
            Your coach hasn't assigned any goals yet.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-muted-foreground text-sm">
              You don't have a coach yet — goals are assigned by your coach.
            </p>
            <Link
              href="/coaches"
              className="text-primary text-sm font-medium underline underline-offset-4"
            >
              Find a coach
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {goals.map((goal) => (
        <GoalRow key={goal.id} goal={goal} />
      ))}
    </ul>
  );
}
