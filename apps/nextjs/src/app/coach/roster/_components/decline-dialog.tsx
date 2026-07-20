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
 * Decline confirmation with an optional reason (#11 acceptance criterion 3).
 * The reason is stored as `responseNote` and shown to the applicant on
 * `/coaches`.
 */
export function DeclineDialog({
  relationshipId,
  applicantName,
  open,
  onOpenChange,
}: {
  relationshipId: string | null;
  applicantName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const decline = useMutation(
    trpc.coaching.relationships.decline.mutationOptions({
      onSuccess: () => {
        toast.success("Application declined");
        setReason("");
        void queryClient.invalidateQueries({
          queryKey: trpc.coaching.relationships.roster.queryKey(),
        });
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to decline application");
      },
    }),
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!relationshipId) return;
    decline.mutate({
      relationshipId,
      reason: reason.trim().length > 0 ? reason.trim() : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline {applicantName}'s application?</DialogTitle>
          <DialogDescription>
            They'll be able to see this on their end. This can't be undone.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="decline-reason">Reason (optional)</Label>
            <textarea
              id="decline-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Let them know why, if you'd like…"
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
            <Button
              type="submit"
              variant="destructive"
              disabled={decline.isPending}
            >
              {decline.isPending ? "Declining…" : "Decline"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
