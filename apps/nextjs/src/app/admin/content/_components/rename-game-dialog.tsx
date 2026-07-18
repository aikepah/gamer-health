"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@gamer-health/api";
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

export function RenameGameDialog({
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

  const [name, setName] = useState(game?.name ?? "");
  const [platform, setPlatform] = useState(game?.platform ?? "");

  // Re-sync the form when a different game is opened for rename (adjusting
  // state during render avoids an extra cascading effect-driven render).
  const [syncedGameId, setSyncedGameId] = useState(game?.id);
  if (game?.id !== syncedGameId) {
    setSyncedGameId(game?.id);
    setName(game?.name ?? "");
    setPlatform(game?.platform ?? "");
  }

  const rename = useMutation(
    trpc.admin.content.renameGame.mutationOptions({
      onSuccess: () => {
        toast.success("Game renamed");
        void queryClient.invalidateQueries({
          queryKey: trpc.admin.content.listGames.queryKey(),
        });
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to rename game");
      },
    }),
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!game) return;
    rename.mutate({
      gameId: game.id,
      name,
      platform: platform.trim() ? platform.trim() : null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename game</DialogTitle>
          <DialogDescription>
            Updates the name/platform shown everywhere this game appears.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-game-name">Name</Label>
            <Input
              id="rename-game-name"
              required
              maxLength={256}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-game-platform">Platform</Label>
            <Input
              id="rename-game-platform"
              maxLength={64}
              placeholder="PC"
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={rename.isPending}>
              {rename.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
