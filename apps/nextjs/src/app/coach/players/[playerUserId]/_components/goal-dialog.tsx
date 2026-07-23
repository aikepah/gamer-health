"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@gamer-health/api";
import { Button } from "@gamer-health/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@gamer-health/ui/dialog";
import { Input } from "@gamer-health/ui/input";
import { Label } from "@gamer-health/ui/label";
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";

type GoalItem = RouterOutputs["coaching"]["goals"]["listForPlayer"][number];

/**
 * Assign (create) or edit a goal (#13). Same form for both — `mode`
 * decides which mutation fires. Edit always resends all three editable
 * fields (never a partial patch from the UI's perspective); the core
 * `updateGoal` schema still normalizes "" -> null for description/targetDate.
 */
export function GoalDialog({
  mode,
  playerUserId,
  goal,
  open,
  onOpenChange,
  onSaved,
}: {
  mode: "create" | "edit";
  playerUserId: string;
  goal?: GoalItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const trpc = useTRPC();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");

  // Re-seed the form fields from `goal` the moment the dialog opens — this
  // is React's "adjust state during render" pattern (not an effect), since
  // an effect here would fire a redundant extra render after the paint.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTitle(goal?.title ?? "");
      setDescription(goal?.description ?? "");
      setTargetDate(goal?.targetDate ?? "");
    }
  }

  const create = useMutation(
    trpc.coaching.goals.create.mutationOptions({
      onSuccess: () => {
        toast.success("Goal assigned");
        onSaved();
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message || "Failed to assign goal"),
    }),
  );
  const update = useMutation(
    trpc.coaching.goals.update.mutationOptions({
      onSuccess: () => {
        toast.success("Goal updated");
        onSaved();
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message || "Failed to update goal"),
    }),
  );

  const isPending = create.isPending || update.isPending;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "create") {
      create.mutate({
        playerUserId,
        title,
        description,
        targetDate,
      });
      return;
    }
    if (!goal) return;
    update.mutate({
      goalId: goal.id,
      title,
      description,
      targetDate,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Assign a goal" : "Edit goal"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-title">Title</Label>
            <Input
              id="goal-title"
              required
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-description">Description (optional)</Label>
            <textarea
              id="goal-description"
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="border-input placeholder:text-muted-foreground w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-target-date">Target date (optional)</Label>
            <Input
              id="goal-target-date"
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
              className="w-40"
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
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : mode === "create" ? "Assign" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
