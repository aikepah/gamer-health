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
import { HabitDefinitionDialog } from "./habit-definition-dialog";

type HabitDefinitionRow =
  RouterOutputs["admin"]["content"]["listHabitDefinitions"][number];

const TRIGGER_LABELS: Record<HabitTriggerType, string> = {
  session_interval: "Session interval",
  daily_schedule: "Daily schedule",
  bedtime_cutoff: "Bedtime cutoff",
};

function configSummary(row: HabitDefinitionRow): string {
  if (row.triggerType === "session_interval") {
    return `Every ${row.defaultConfig.intervalMinutes ?? "?"} min`;
  }
  if (row.triggerType === "daily_schedule") {
    return `At ${row.defaultConfig.timeOfDay ?? "?"}`;
  }
  return `${row.defaultConfig.bedtime ?? "?"} − ${row.defaultConfig.leadMinutes ?? "?"} min`;
}

export function HabitDefinitionsTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data } = useSuspenseQuery(
    trpc.admin.content.listHabitDefinitions.queryOptions(),
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HabitDefinitionRow | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: trpc.admin.content.listHabitDefinitions.queryKey(),
    });
  }

  const setArchived = useMutation(
    trpc.admin.content.setHabitDefinitionArchived.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.archivedAt ? "Definition archived" : "Definition unarchived",
        );
        invalidate();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update definition");
      },
    }),
  );

  const deleteDefinition = useMutation(
    trpc.admin.content.deleteHabitDefinition.mutationOptions({
      onSuccess: () => {
        toast.success("Definition deleted");
        invalidate();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete definition");
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
          New default habit
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3 font-medium">Title</th>
              <th className="p-3 font-medium">Trigger</th>
              <th className="p-3 font-medium">Default config</th>
              <th className="p-3 font-medium">Instances</th>
              <th className="p-3 font-medium">Origin</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const isArchived = row.archivedAt !== null;
              const isBuiltIn = row.slug !== null;
              const canDelete = !isBuiltIn && row.instanceCount === 0;
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
                  <td className="p-3">{row.instanceCount}</td>
                  <td className="p-3">{isBuiltIn ? "Built-in" : "Admin"}</td>
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
                            id: row.id,
                            archived: !isArchived,
                          })
                        }
                      >
                        {isArchived ? "Unarchive" : "Archive"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!canDelete || deleteDefinition.isPending}
                        title={
                          isBuiltIn
                            ? "Built-in definitions can't be deleted — archive instead"
                            : row.instanceCount > 0
                              ? "In use — archive instead"
                              : undefined
                        }
                        onClick={() => {
                          if (window.confirm(`Delete "${row.title}"?`)) {
                            deleteDefinition.mutate({ id: row.id });
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="text-muted-foreground p-6 text-center"
                >
                  No habit definitions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <HabitDefinitionDialog
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
