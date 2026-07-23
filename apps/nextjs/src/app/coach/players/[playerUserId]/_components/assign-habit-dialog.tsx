"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { HabitTriggerType } from "@gamer-health/validators";
import { Button } from "@gamer-health/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@gamer-health/ui/dialog";
import { Input } from "@gamer-health/ui/input";
import { Label } from "@gamer-health/ui/label";
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";

/**
 * Assign-habit dialog for a coach's player-detail page (#14). Definitions
 * are grouped "Catalog" (the default catalog) vs "My habits" (this coach's
 * own) — exactly the set `listAssignableHabitDefinitions` returns, so the
 * dropdown can never offer something `assign` would reject. Config override
 * fields default to the chosen definition's own default config.
 */
export function AssignHabitDialog({
  playerUserId,
  open,
  onOpenChange,
}: {
  playerUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: assignable } = useQuery(
    trpc.coaching.assignedHabits.listAssignable.queryOptions(),
  );

  const [definitionId, setDefinitionId] = useState("");
  const selected = assignable?.find((d) => d.id === definitionId) ?? null;

  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [timeOfDay, setTimeOfDay] = useState("17:00");
  const [bedtime, setBedtime] = useState("23:00");
  const [leadMinutes, setLeadMinutes] = useState(60);

  // Re-sync override defaults whenever the selected definition changes.
  const [syncedDefId, setSyncedDefId] = useState<string | null>(null);
  if (selected && selected.id !== syncedDefId) {
    setSyncedDefId(selected.id);
    setIntervalMinutes(selected.defaultConfig.intervalMinutes ?? 30);
    setTimeOfDay(selected.defaultConfig.timeOfDay ?? "17:00");
    setBedtime(selected.defaultConfig.bedtime ?? "23:00");
    setLeadMinutes(selected.defaultConfig.leadMinutes ?? 60);
  }

  const assign = useMutation(
    trpc.coaching.assignedHabits.assign.mutationOptions({
      onSuccess: () => {
        toast.success("Habit assigned");
        void queryClient.invalidateQueries({
          queryKey: trpc.coaching.assignedHabits.listPlayerHabits.queryKey({
            playerUserId,
          }),
        });
        onOpenChange(false);
        setDefinitionId("");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to assign habit");
      },
    }),
  );

  function configFor(trigger: HabitTriggerType) {
    if (trigger === "session_interval") return { intervalMinutes };
    if (trigger === "daily_schedule") return { timeOfDay };
    return { bedtime, leadMinutes };
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    assign.mutate({
      playerUserId,
      definitionId: selected.id,
      config: configFor(selected.triggerType),
    });
  }

  const catalog = assignable?.filter((d) => d.isDefault) ?? [];
  const mine = assignable?.filter((d) => !d.isDefault) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign a habit</DialogTitle>
          <DialogDescription>
            The player sees it enabled immediately, badged "Assigned by you".
            They can pause or reconfigure it, but can't remove it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assign-habit-def">Habit</Label>
            <select
              id="assign-habit-def"
              required
              value={definitionId}
              onChange={(event) => setDefinitionId(event.target.value)}
              className="border-input h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"
            >
              <option value="" disabled>
                Select a habit…
              </option>
              {catalog.length > 0 && (
                <optgroup label="Catalog">
                  {catalog.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </optgroup>
              )}
              {mine.length > 0 && (
                <optgroup label="My habits">
                  {mine.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {selected?.triggerType === "session_interval" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assign-habit-interval">Interval (minutes)</Label>
              <Input
                id="assign-habit-interval"
                type="number"
                min={5}
                max={240}
                value={intervalMinutes}
                onChange={(event) =>
                  setIntervalMinutes(Number(event.target.value))
                }
                className="w-28"
              />
            </div>
          )}
          {selected?.triggerType === "daily_schedule" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assign-habit-time">Time of day</Label>
              <Input
                id="assign-habit-time"
                type="time"
                value={timeOfDay}
                onChange={(event) => setTimeOfDay(event.target.value)}
                className="w-32"
              />
            </div>
          )}
          {selected?.triggerType === "bedtime_cutoff" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="assign-habit-bedtime">Bedtime</Label>
                <Input
                  id="assign-habit-bedtime"
                  type="time"
                  value={bedtime}
                  onChange={(event) => setBedtime(event.target.value)}
                  className="w-32"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="assign-habit-lead">Lead time (minutes)</Label>
                <Input
                  id="assign-habit-lead"
                  type="number"
                  min={0}
                  max={240}
                  value={leadMinutes}
                  onChange={(event) =>
                    setLeadMinutes(Number(event.target.value))
                  }
                  className="w-28"
                />
              </div>
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!selected || assign.isPending}>
              {assign.isPending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
