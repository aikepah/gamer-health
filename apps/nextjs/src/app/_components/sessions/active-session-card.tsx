"use client";

import { useEffect, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import { Button } from "@gamer-health/ui/button";
import { toast } from "@gamer-health/ui/toast";

import type { PickedGame } from "./game-picker";
import { formatElapsedClock } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { GamePicker } from "./game-picker";

/**
 * Home page card: shows the caller's active session with a live elapsed
 * timer, or a game picker + Start button when none is active.
 *
 * Integration point for the checkins feature: when it lands, its
 * `CheckinDialog` should be opened here (`{ context: "post_session",
 * sessionId }`) after a successful stop. Left as a plain comment seam rather
 * than a dynamic import to a module that doesn't exist yet, so this feature
 * builds and runs standalone.
 */
export function ActiveSessionCard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: active } = useSuspenseQuery(
    trpc.gameSession.active.queryOptions(),
  );

  const [selectedGame, setSelectedGame] = useState<PickedGame | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [active]);

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: trpc.gameSession.active.queryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: trpc.gameSession.list.queryKey(),
    });
  };

  const startSession = useMutation(
    trpc.gameSession.start.mutationOptions({
      onSuccess: () => {
        setSelectedGame(null);
        invalidate();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to start session");
      },
    }),
  );

  const stopSession = useMutation(
    trpc.gameSession.stop.mutationOptions({
      onSuccess: () => {
        toast.success("Session logged. +10 XP");
        invalidate();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to stop session");
      },
    }),
  );

  if (active) {
    const elapsedMs = now - new Date(active.startedAt).getTime();
    return (
      <div className="border-border w-full max-w-md rounded-lg border p-4">
        <p className="text-muted-foreground text-sm">Now playing</p>
        <p className="text-xl font-semibold">{active.game.name}</p>
        <p className="text-primary mt-1 font-mono text-3xl tabular-nums">
          {formatElapsedClock(elapsedMs)}
        </p>
        <Button
          className="mt-4"
          variant="destructive"
          disabled={stopSession.isPending}
          onClick={() => stopSession.mutate({})}
        >
          {stopSession.isPending ? "Stopping…" : "Stop session"}
        </Button>
      </div>
    );
  }

  return (
    <div className="border-border w-full max-w-md rounded-lg border p-4">
      <p className="text-muted-foreground mb-2 text-sm">Start a session</p>
      <GamePicker value={selectedGame} onChange={setSelectedGame} />
      <Button
        className="mt-4"
        disabled={!selectedGame || startSession.isPending}
        onClick={() =>
          selectedGame && startSession.mutate({ gameId: selectedGame.id })
        }
      >
        {startSession.isPending ? "Starting…" : "Start"}
      </Button>
    </div>
  );
}
