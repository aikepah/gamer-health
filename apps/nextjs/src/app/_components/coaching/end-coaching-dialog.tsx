"use client";

import { useState } from "react";
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
import { Label } from "@gamer-health/ui/label";
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";

/**
 * Confirm dialog for ending an active coaching relationship (#11). Either
 * side can end it — this component is used from the player's "My coach"
 * card; the coach-side roster reuses the same `relationships.end` mutation
 * once #12 adds a coach-facing player page.
 */
export function EndCoachingDialog({
  relationshipId,
  open,
  onOpenChange,
}: {
  relationshipId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const end = useMutation(
    trpc.coaching.relationships.end.mutationOptions({
      onSuccess: () => {
        toast.success("Coaching relationship ended");
        setReason("");
        void queryClient.invalidateQueries({
          queryKey: trpc.coaching.relationships.myCoach.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.coaching.discovery.myApplications.queryKey(),
        });
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to end coaching relationship");
      },
    }),
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    end.mutate({
      relationshipId,
      reason: reason.trim().length > 0 ? reason.trim() : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End coaching relationship?</DialogTitle>
          <DialogDescription>
            You'll lose access to each other's coaching-specific pages. This
            can't be undone — you'd need to apply again to restart.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="end-reason">Reason (optional)</Label>
            <textarea
              id="end-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="border-input placeholder:text-muted-foreground w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm"
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
            <Button type="submit" variant="destructive" disabled={end.isPending}>
              {end.isPending ? "Ending…" : "End coaching"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
