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
 * Cancel-with-optional-reason dialog (#15), shared by the player's session
 * list, the scheduler's confirmed-slot view, and the coach's sessions page —
 * `coaching.sessions.cancel` works for either side, and a coach cancelling a
 * `proposed` row IS the decline action (there's no separate status).
 */
export function CancelSessionDialog({
  sessionId,
  title,
  description,
  open,
  onOpenChange,
}: {
  sessionId: string | null;
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const cancel = useMutation(
    trpc.coaching.sessions.cancel.mutationOptions({
      onSuccess: () => {
        toast.success("Session cancelled");
        setReason("");
        void queryClient.invalidateQueries({
          queryKey: trpc.coaching.sessions.list.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.coaching.sessions.schedulingContext.queryKey(),
        });
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to cancel that session");
      },
    }),
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!sessionId) return;
    cancel.mutate({
      sessionId,
      reason: reason.trim().length > 0 ? reason.trim() : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cancel-session-reason">Reason (optional)</Label>
            <textarea
              id="cancel-session-reason"
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
              Never mind
            </Button>
            <Button type="submit" variant="destructive" disabled={cancel.isPending}>
              {cancel.isPending ? "Cancelling…" : "Cancel session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
