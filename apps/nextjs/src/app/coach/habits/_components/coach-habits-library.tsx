"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import type { RouterOutputs } from "@gamer-health/api";
import type { HabitTriggerType } from "@gamer-health/validators";
import { cn } from "@gamer-health/ui";
import { Button } from "@gamer-health/ui/button";
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";
import { CoachHabitDefinitionDialog } from "./coach-habit-definition-dialog";

type CoachHabitDefinitionRow =
  RouterOutputs["coaching"]["assignedHabits"]["listDefinitions"][number];

const TRIGGER_LABELS: Record<HabitTriggerType, string> = {
  session_interval: "Session interval",
  daily_schedule: "Daily schedule",
  bedtime_cutoff: "Bedtime cutoff",
};

function configSummary(row: CoachHabitDefinitionRow): string {
  if (row.triggerType === "session_interval") {
    return `Every ${row.defaultConfig.intervalMinutes ?? "?"} min`;
  }
  if (row.triggerType === "daily_schedule") {
    return `At ${row.defaultConfig.timeOfDay ?? "?"}`;
  }
  return `${row.defaultConfig.bedtime ?? "?"} − ${row.defaultConfig.leadMinutes ?? "?"} min`;
}

/**
 * `/coach/habits` (#14): the coach's own habit-definition library —
 * gaming and out-of-game habits alike, since both use the same generalized
 * `habit_definition` row (docs/features/habit-generalization.md). Create,
 * edit (trigger type locked after creation), and archive/unarchive.
 * Archiving never touches players who already have the habit assigned —
 * see docs/features/coach-habit-assignment.md.
 */
export function CoachHabitsLibrary() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data } = useSuspenseQuery(
    trpc.coaching.assignedHabits.listDefinitions.queryOptions(),
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CoachHabitDefinitionRow | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: trpc.coaching.assignedHabits.listDefinitions.queryKey(),
    });
  }

  const setArchived = useMutation(
    trpc.coaching.assignedHabits.setDefinitionArchived.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.archivedAt ? "Habit archived" : "Habit unarchived",
        );
        invalidate();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update habit");
      },
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          New habit
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3 font-medium">Title</th>
              <th className="p-3 font-medium">Trigger</th>
              <th className="p-3 font-medium">Default config</th>
              <th className="p-3 font-medium">Assigned</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const isArchived = row.archivedAt !== null;
              return (
                <tr
                  key={row.id}
                  className={cn("border-t", isArchived && "opacity-60")}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{row.title}</span>
                      {isArchived && (
                        <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                          Archived
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {row.description}
                    </p>
                  </td>
                  <td className="p-3">{TRIGGER_LABELS[row.triggerType]}</td>
                  <td className="p-3">{configSummary(row)}</td>
                  <td className="p-3">{row.assignedCount}</td>
                  <td className="p-3">{isArchived ? "Archived" : "Active"}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(row);
                          setDialogOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={setArchived.isPending}
                        onClick={() =>
                          setArchived.mutate({
                            definitionId: row.id,
                            archived: !isArchived,
                          })
                        }
                      >
                        {isArchived ? "Unarchive" : "Archive"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="text-muted-foreground p-6 text-center"
                >
                  No habits yet — create one to assign it to a player.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CoachHabitDefinitionDialog
        definition={editing}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      />
    </div>
  );
}
