"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import type { RouterOutputs } from "@gamer-health/api";
import { Button } from "@gamer-health/ui/button";
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";
import { GoalDialog } from "./goal-dialog";

type GoalItem = RouterOutputs["coaching"]["goals"]["listForPlayer"][number];

const STATUS_ORDER = ["open", "completed", "abandoned"] as const;
const STATUS_LABELS: Record<GoalItem["status"], string> = {
  open: "Open",
  completed: "Completed",
  abandoned: "Abandoned",
};

/**
 * Coach's Goals panel for one roster player (#13, acceptance criterion 1-2):
 * goals grouped by status, an Assign-goal dialog, and per-goal edit/status/
 * delete actions. All authorization (`assertCoachOf`) lives in the core
 * services this calls — this component has no business logic of its own.
 */
export function GoalsPanel({ playerUserId }: { playerUserId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: goals } = useSuspenseQuery(
    trpc.coaching.goals.listForPlayer.queryOptions({ playerUserId }),
  );

  const [assignOpen, setAssignOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalItem | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: trpc.coaching.goals.listForPlayer.queryKey({ playerUserId }),
    });
    void queryClient.invalidateQueries({
      queryKey: trpc.coaching.goals.rosterSummary.queryKey(),
    });
  }

  const setStatus = useMutation(
    trpc.coaching.goals.setStatus.mutationOptions({
      onSuccess: invalidate,
      onError: (error) => toast.error(error.message || "Failed to update goal"),
    }),
  );
  const deleteGoal = useMutation(
    trpc.coaching.goals.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Goal deleted");
        invalidate();
      },
      onError: (error) => toast.error(error.message || "Failed to delete goal"),
    }),
  );

  const groups = STATUS_ORDER.map((status) => ({
    status,
    items: goals.filter((goal) => goal.status === status),
  }));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Goals</h2>
        <Button size="sm" onClick={() => setAssignOpen(true)}>
          Assign goal
        </Button>
      </div>

      {goals.length === 0 ? (
        <p className="text-muted-foreground text-sm">No goals assigned yet.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(
            (group) =>
              group.items.length > 0 && (
                <div key={group.status}>
                  <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                    {STATUS_LABELS[group.status]} ({group.items.length})
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {group.items.map((goal) => (
                      <li key={goal.id} className="rounded-lg border p-3">
                        <div>
                          <p className="font-medium">
                            {goal.title}
                            {goal.overdue && (
                              <span className="text-destructive ml-2 text-xs font-semibold">
                                Overdue
                              </span>
                            )}
                          </p>
                          {goal.description && (
                            <p className="text-muted-foreground text-sm">
                              {goal.description}
                            </p>
                          )}
                          {goal.targetDate && (
                            <p className="text-muted-foreground mt-1 text-xs">
                              Target: {goal.targetDate}
                            </p>
                          )}
                          {goal.progressNote && (
                            <p className="mt-1 text-xs italic">
                              "{goal.progressNote}"
                            </p>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingGoal(goal)}
                          >
                            Edit
                          </Button>
                          {goal.status === "open" && (
                            <>
                              <Button
                                size="sm"
                                disabled={setStatus.isPending}
                                onClick={() =>
                                  setStatus.mutate({
                                    goalId: goal.id,
                                    status: "completed",
                                  })
                                }
                              >
                                Complete
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={setStatus.isPending}
                                onClick={() =>
                                  setStatus.mutate({
                                    goalId: goal.id,
                                    status: "abandoned",
                                  })
                                }
                              >
                                Abandon
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={deleteGoal.isPending}
                                onClick={() =>
                                  deleteGoal.mutate({ goalId: goal.id })
                                }
                              >
                                Delete
                              </Button>
                            </>
                          )}
                          {goal.status !== "open" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={setStatus.isPending}
                              onClick={() =>
                                setStatus.mutate({
                                  goalId: goal.id,
                                  status: "open",
                                })
                              }
                            >
                              Reopen
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
          )}
        </div>
      )}

      <GoalDialog
        mode="create"
        playerUserId={playerUserId}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        onSaved={invalidate}
      />
      <GoalDialog
        mode="edit"
        playerUserId={playerUserId}
        goal={editingGoal}
        open={editingGoal !== null}
        onOpenChange={(open) => {
          if (!open) setEditingGoal(null);
        }}
        onSaved={invalidate}
      />
    </section>
  );
}
