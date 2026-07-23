"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@gamer-health/api";
import { Button } from "@gamer-health/ui/button";

import { useTRPC } from "~/trpc/react";
import { AssignHabitDialog } from "./assign-habit-dialog";
import { UnassignHabitDialog } from "./unassign-habit-dialog";

type CoachPlayerHabitRow =
  RouterOutputs["coaching"]["assignedHabits"]["listPlayerHabits"][number];

function sourceLabel(row: CoachPlayerHabitRow): string {
  if (row.assignedByMe) return "Assigned by you";
  if (row.assignedByUserId) return "Assigned (other coach)";
  return "Self-adopted";
}

/**
 * Habits panel on the coach's player-detail page (#14): every habit the
 * player has (self-adopted or assigned), source, enabled state, and a 7-day
 * completion rate, plus Assign/Unassign actions. Gated server-side by
 * `assertCoachOf` — if the coaching relationship has ended, the query
 * 403s and this renders a plain message instead of the table.
 */
export function PlayerHabitsPanel({ playerUserId }: { playerUserId: string }) {
  const trpc = useTRPC();

  const { data, isLoading, isError, error } = useQuery(
    trpc.coaching.assignedHabits.listPlayerHabits.queryOptions({
      playerUserId,
    }),
  );

  const [assignOpen, setAssignOpen] = useState(false);
  const [unassignTarget, setUnassignTarget] = useState<{
    habitId: string;
    title: string;
    isDefaultDefinition: boolean;
  } | null>(null);

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading habits…</p>;
  }
  if (isError || !data) {
    return (
      <p className="text-muted-foreground text-sm">
        {error?.message ?? "Unable to load this player's habits."}
      </p>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Habits</h2>
        <Button size="sm" onClick={() => setAssignOpen(true)}>
          Assign habit
        </Button>
      </div>

      {data.length === 0 ? (
        <p className="text-muted-foreground text-sm">No habits yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-medium">Habit</th>
                <th className="p-3 font-medium">Source</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Last 7 days</th>
                <th className="p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.habitId} className="border-t">
                  <td className="p-3 font-medium">{row.title}</td>
                  <td className="p-3">{sourceLabel(row)}</td>
                  <td className="p-3">{row.enabled ? "Enabled" : "Paused"}</td>
                  <td className="p-3">
                    {row.total === 0 ? "No data" : `${row.done}/${row.total}`}
                  </td>
                  <td className="p-3">
                    {row.assignedByMe && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setUnassignTarget({
                            habitId: row.habitId,
                            title: row.title,
                            isDefaultDefinition: row.isDefaultDefinition,
                          })
                        }
                      >
                        Unassign
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AssignHabitDialog
        playerUserId={playerUserId}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />
      <UnassignHabitDialog
        playerUserId={playerUserId}
        target={unassignTarget}
        isCustomDefinition={unassignTarget?.isDefaultDefinition === false}
        onOpenChange={(open) => {
          if (!open) setUnassignTarget(null);
        }}
      />
    </section>
  );
}
