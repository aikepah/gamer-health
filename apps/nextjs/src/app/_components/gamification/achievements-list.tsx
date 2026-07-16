"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";

/**
 * Grid of all achievements (locked ones dimmed, unlock dates shown for
 * unlocked ones). Presentation-only — fetches via `gamification.achievements`.
 */
export function AchievementsList() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.gamification.achievements.queryOptions());

  if (!data) {
    return (
      <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="bg-muted h-20 w-full animate-pulse rounded-lg"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:grid-cols-3">
      {data.map((achievement) => (
        <div
          key={achievement.key}
          className={`border-border rounded-lg border p-3 ${
            achievement.unlockedAt ? "" : "opacity-40"
          }`}
        >
          <p className="text-sm font-semibold">{achievement.title}</p>
          <p className="text-muted-foreground text-xs">
            {achievement.description}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {achievement.unlockedAt
              ? `Unlocked ${new Date(achievement.unlockedAt).toLocaleDateString()}`
              : `${achievement.xp} XP`}
          </p>
        </div>
      ))}
    </div>
  );
}
