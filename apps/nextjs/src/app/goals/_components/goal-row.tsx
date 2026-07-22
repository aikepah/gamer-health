"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@gamer-health/api";
import { Button } from "@gamer-health/ui/button";
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";

type GoalItem = RouterOutputs["coaching"]["goals"]["listMine"][number];

const STATUS_LABELS: Record<GoalItem["status"], string> = {
  open: "Open",
  completed: "Completed",
  abandoned: "Abandoned",
};

const PROGRESS_NOTE_DEBOUNCE_MS = 800;

/**
 * One goal row on `/goals` (#13): status actions (Complete/Abandon/Reopen)
 * plus an inline progress-note textarea that autosaves on a debounce — no
 * explicit save button, matching the spec's "autosaves" requirement.
 */
export function GoalRow({ goal }: { goal: GoalItem }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [note, setNote] = useState(goal.progressNote ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: trpc.coaching.goals.listMine.queryKey(),
    });
  }

  const setStatus = useMutation(
    trpc.coaching.goals.setStatus.mutationOptions({
      onSuccess: invalidate,
      onError: (error) => toast.error(error.message || "Failed to update goal"),
    }),
  );

  const updateProgress = useMutation(
    trpc.coaching.goals.updateProgress.mutationOptions({
      onError: (error) => toast.error(error.message || "Failed to save note"),
    }),
  );

  function handleNoteChange(value: string) {
    setNote(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateProgress.mutate({ goalId: goal.id, progressNote: value });
    }, PROGRESS_NOTE_DEBOUNCE_MS);
  }

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {goal.title}
            {goal.status !== "open" && (
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                ({STATUS_LABELS[goal.status]})
              </span>
            )}
            {goal.overdue && (
              <span className="text-destructive ml-2 text-xs font-semibold">
                Overdue
              </span>
            )}
          </p>
          {goal.description && (
            <p className="text-muted-foreground text-sm">{goal.description}</p>
          )}
          <p className="text-muted-foreground mt-1 text-xs">
            {goal.targetDate ? `Target: ${goal.targetDate}` : "No target date"}
            {goal.assignedBy && ` · Assigned by ${goal.assignedBy.name}`}
          </p>
        </div>
        <div className="flex gap-2">
          {goal.status === "open" ? (
            <>
              <Button
                size="sm"
                disabled={setStatus.isPending}
                onClick={() =>
                  setStatus.mutate({ goalId: goal.id, status: "completed" })
                }
              >
                Complete
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={setStatus.isPending}
                onClick={() =>
                  setStatus.mutate({ goalId: goal.id, status: "abandoned" })
                }
              >
                Abandon
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={setStatus.isPending}
              onClick={() =>
                setStatus.mutate({ goalId: goal.id, status: "open" })
              }
            >
              Reopen
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <label
          htmlFor={`goal-note-${goal.id}`}
          className="text-muted-foreground text-xs font-medium"
        >
          Progress note
        </label>
        <textarea
          id={`goal-note-${goal.id}`}
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(event) => handleNoteChange(event.target.value)}
          placeholder="How's it going?"
          className="border-input placeholder:text-muted-foreground w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm"
        />
      </div>
    </li>
  );
}
