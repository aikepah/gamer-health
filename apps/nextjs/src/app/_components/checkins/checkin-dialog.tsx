"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";

export interface CheckinDialogProps {
  /** `post_session` requires `sessionId`; `daily` shows a sleep-quality row. */
  context: "daily" | "post_session";
  sessionId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function RatingRow({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </span>
        {!required && value !== null && (
          <button
            type="button"
            className="text-muted-foreground text-xs underline underline-offset-2"
            onClick={() => onChange(null)}
          >
            Skip
          </button>
        )}
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={cn(
              "h-9 w-9 rounded-md border text-sm font-medium transition-colors",
              value === n
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 10-second mood/energy/(sleep) check-in dialog. Reused by the home page's
 * daily check-in card (`context: "daily"`) and session-tracking's stop flow
 * (`context: "post_session"`, `sessionId`). Closing without submitting is a
 * no-op — skipping a check-in records nothing.
 */
export function CheckinDialog({
  context,
  sessionId,
  open,
  onOpenChange,
}: CheckinDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMood(null);
    setEnergy(null);
    setSleepQuality(null);
    setNote("");
    setError(null);
  }

  const createCheckin = useMutation(
    trpc.checkin.create.mutationOptions({
      onSuccess: () => {
        toast.success("Check-in saved. +10 XP");
        void queryClient.invalidateQueries({
          queryKey: trpc.checkin.todayStatus.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.checkin.list.queryKey(),
        });
        reset();
        onOpenChange(false);
      },
      onError: (mutationError) => {
        setError(mutationError.message || "Failed to save check-in");
      },
    }),
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (mood === null) {
      setError("Mood is required");
      return;
    }
    createCheckin.mutate({
      context,
      sessionId: context === "post_session" ? sessionId : undefined,
      mood,
      energy: energy ?? undefined,
      sleepQuality:
        context === "daily" ? (sleepQuality ?? undefined) : undefined,
      note: note.trim() ? note.trim() : undefined,
    });
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
          <DialogTitle>
            {context === "daily" ? "Daily check-in" : "How was that session?"}
          </DialogTitle>
          <DialogDescription>Takes about 10 seconds.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <RatingRow label="Mood" value={mood} onChange={setMood} required />
          <RatingRow label="Energy" value={energy} onChange={setEnergy} />
          {context === "daily" && (
            <RatingRow
              label="Sleep quality"
              value={sleepQuality}
              onChange={setSleepQuality}
            />
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="checkin-note" className="text-sm font-medium">
              Note (optional)
            </label>
            <textarea
              id="checkin-note"
              rows={2}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="border-input placeholder:text-muted-foreground w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm"
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Skip
            </Button>
            <Button type="submit" disabled={createCheckin.isPending}>
              {createCheckin.isPending ? "Saving…" : "Save check-in"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
