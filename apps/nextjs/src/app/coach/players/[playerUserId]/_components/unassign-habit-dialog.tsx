"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@gamer-health/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@gamer-health/ui/dialog";
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";

/**
 * Unassign confirmation (#14). Never deletes player data — for a coach-custom
 * habit this pauses it for the player (since it drops out of their visible
 * catalog otherwise); for a default-catalog habit it just reverts to
 * self-adopted and keeps running. See docs/features/coach-habit-assignment.md.
 */
export function UnassignHabitDialog({
  playerUserId,
  target,
  isCustomDefinition,
  onOpenChange,
}: {
  playerUserId: string;
  target: { habitId: string; title: string } | null;
  /** Whether the habit's definition is coach-custom (isDefault: false). */
  isCustomDefinition: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const unassign = useMutation(
    trpc.coaching.assignedHabits.unassign.mutationOptions({
      onSuccess: () => {
        toast.success("Habit unassigned");
        void queryClient.invalidateQueries({
          queryKey: trpc.coaching.assignedHabits.listPlayerHabits.queryKey({
            playerUserId,
          }),
        });
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to unassign habit");
      },
    }),
  );

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unassign "{target?.title}"?</DialogTitle>
          <DialogDescription>
            {isCustomDefinition
              ? "This habit isn't in the default catalog, so unassigning it will also pause it for the player — it stops generating prompts until reassigned."
              : "This reverts to a self-adopted habit — it keeps running for the player, you just won't manage it anymore."}
          </DialogDescription>
        </DialogHeader>
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
            disabled={unassign.isPending}
            onClick={() => {
              if (!target) return;
              unassign.mutate({ habitId: target.habitId });
            }}
          >
            {unassign.isPending ? "Unassigning…" : "Unassign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
