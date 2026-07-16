"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { HabitCard } from "./habit-card";

export function HabitsPageClient() {
  const trpc = useTRPC();
  const { data: habits } = useSuspenseQuery(trpc.habit.list.queryOptions());

  return (
    <div className="flex flex-col gap-4">
      {habits.map((habit) => (
        <HabitCard key={habit.kind} item={habit} />
      ))}
    </div>
  );
}
