"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@gamer-health/api";
import { cn } from "@gamer-health/ui";
import { Button } from "@gamer-health/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@gamer-health/ui/dialog";
import { Input } from "@gamer-health/ui/input";
import { Label } from "@gamer-health/ui/label";
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";

type GameRow = RouterOutputs["admin"]["content"]["listGames"]["games"][number];

export function MergeGameDialog({
  game,
  open,
  onOpenChange,
}: {
  game: GameRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<{ id: string; name: string } | null>(
    null,
  );

  const targetSearch = useQuery({
    ...trpc.admin.content.listGames.queryOptions({ query, limit: 10 }),
    enabled: open,
  });
  const candidates = (targetSearch.data?.games ?? []).filter(
    (g) => g.id !== game?.id,
  );

  function reset() {
    setQuery("");
    setTarget(null);
  }

  const merge = useMutation(
    trpc.admin.content.mergeGames.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `Merged — moved ${result.movedSessions} session${result.movedSessions === 1 ? "" : "s"}`,
        );
        void queryClient.invalidateQueries({
          queryKey: trpc.admin.content.listGames.queryKey(),
        });
        reset();
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to merge games");
      },
    }),
  );

  function handleConfirm() {
    if (!game || !target) return;
    merge.mutate({ sourceGameId: game.id, targetGameId: target.id });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge game</DialogTitle>
          <DialogDescription>
            {game && (
              <>
                Moves all {game.sessionCount} session
                {game.sessionCount === 1 ? "" : "s"} from &ldquo;{game.name}
                &rdquo; to the game you pick below, then removes &ldquo;
                {game.name}&rdquo; from the catalog.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="merge-target-search">Merge into</Label>
          <Input
            id="merge-target-search"
            placeholder="Search for a game…"
            value={target ? target.name : query}
            onChange={(event) => {
              setTarget(null);
              setQuery(event.target.value);
            }}
          />
          {!target && (
            <ul className="max-h-48 overflow-y-auto rounded-md border">
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className="hover:bg-accent hover:text-accent-foreground w-full px-3 py-1.5 text-left text-sm"
                    onClick={() => {
                      setTarget({ id: candidate.id, name: candidate.name });
                      setQuery(candidate.name);
                    }}
                  >
                    {candidate.name}
                    {candidate.platform && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {candidate.platform}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {candidates.length === 0 && (
                <li className="text-muted-foreground px-3 py-1.5 text-sm">
                  No matching games
                </li>
              )}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!target || merge.isPending}
            className={cn(!target && "cursor-not-allowed")}
            onClick={handleConfirm}
          >
            {merge.isPending ? "Merging…" : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
