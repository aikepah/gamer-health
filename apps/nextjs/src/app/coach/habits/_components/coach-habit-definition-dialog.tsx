"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@gamer-health/api";
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
import { HABIT_TRIGGER_TYPES } from "@gamer-health/validators";

import { useTRPC } from "~/trpc/react";

type CoachHabitDefinitionRow =
  RouterOutputs["coaching"]["assignedHabits"]["listDefinitions"][number];

const TRIGGER_LABELS: Record<HabitTriggerType, string> = {
  session_interval: "Session interval",
  daily_schedule: "Daily schedule",
  bedtime_cutoff: "Bedtime cutoff",
};

/**
 * Create/edit dialog for a coach's own habit definition (#14). `triggerType`
 * is only settable on create (immutable after — same rule as the admin
 * default catalog), so edit mode shows it locked. Mirrors
 * `admin/content/_components/habit-definition-dialog.tsx`'s shape/config
 * fields, adapted to the coach endpoints and this feature's longer
 * description limit (2000 vs 1000).
 */
export function CoachHabitDefinitionDialog({
  definition,
  open,
  onOpenChange,
}: {
  /** null = create mode. */
  definition: CoachHabitDefinitionRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isEdit = definition !== null;

  const [title, setTitle] = useState(definition?.title ?? "");
  const [description, setDescription] = useState(definition?.description ?? "");
  const [promptText, setPromptText] = useState(definition?.promptText ?? "");
  const [triggerType, setTriggerType] = useState<HabitTriggerType>(
    definition?.triggerType ?? "session_interval",
  );
  const [intervalMinutes, setIntervalMinutes] = useState(
    definition?.defaultConfig.intervalMinutes ?? 30,
  );
  const [timeOfDay, setTimeOfDay] = useState(
    definition?.defaultConfig.timeOfDay ?? "17:00",
  );
  const [bedtime, setBedtime] = useState(
    definition?.defaultConfig.bedtime ?? "23:00",
  );
  const [leadMinutes, setLeadMinutes] = useState(
    definition?.defaultConfig.leadMinutes ?? 60,
  );

  // Re-sync the form when a different definition is opened for edit, or the
  // dialog is reopened in create mode.
  const [syncedId, setSyncedId] = useState(definition?.id ?? null);
  if ((definition?.id ?? null) !== syncedId) {
    setSyncedId(definition?.id ?? null);
    setTitle(definition?.title ?? "");
    setDescription(definition?.description ?? "");
    setPromptText(definition?.promptText ?? "");
    setTriggerType(definition?.triggerType ?? "session_interval");
    setIntervalMinutes(definition?.defaultConfig.intervalMinutes ?? 30);
    setTimeOfDay(definition?.defaultConfig.timeOfDay ?? "17:00");
    setBedtime(definition?.defaultConfig.bedtime ?? "23:00");
    setLeadMinutes(definition?.defaultConfig.leadMinutes ?? 60);
  }

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: trpc.coaching.assignedHabits.listDefinitions.queryKey(),
    });
  }

  const create = useMutation(
    trpc.coaching.assignedHabits.createDefinition.mutationOptions({
      onSuccess: () => {
        toast.success("Habit created");
        invalidate();
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create habit");
      },
    }),
  );

  const update = useMutation(
    trpc.coaching.assignedHabits.updateDefinition.mutationOptions({
      onSuccess: () => {
        toast.success("Habit saved");
        invalidate();
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to save habit");
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
    if (isEdit) {
      update.mutate({
        id: definition.id,
        title,
        description,
        promptText,
        defaultConfig: configFor(definition.triggerType),
      });
      return;
    }
    create.mutate({
      title,
      description,
      promptText,
      triggerType,
      defaultConfig: configFor(triggerType),
    });
  }

  const effectiveTrigger = definition?.triggerType ?? triggerType;
  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit habit" : "New habit"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Edits apply to future prompts only."
              : "Out-of-game habits (nutrition, workouts, sleep) work the same as gaming ones — you can assign this to any roster player."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="coach-habit-title">Title</Label>
            <Input
              id="coach-habit-title"
              required
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="coach-habit-description">Description</Label>
            <Input
              id="coach-habit-description"
              required
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="coach-habit-prompt">Prompt text</Label>
            <Input
              id="coach-habit-prompt"
              required
              maxLength={200}
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="coach-habit-trigger">Trigger type</Label>
            {isEdit ? (
              <p className="text-muted-foreground text-sm">
                {TRIGGER_LABELS[effectiveTrigger]} (locked after creation)
              </p>
            ) : (
              <select
                id="coach-habit-trigger"
                value={triggerType}
                onChange={(event) =>
                  setTriggerType(event.target.value as HabitTriggerType)
                }
                className="border-input h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"
              >
                {HABIT_TRIGGER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TRIGGER_LABELS[t]}
                  </option>
                ))}
              </select>
            )}
          </div>

          {effectiveTrigger === "session_interval" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="coach-habit-interval">
                Default interval (minutes)
              </Label>
              <Input
                id="coach-habit-interval"
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
          {effectiveTrigger === "daily_schedule" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="coach-habit-time">Default time of day</Label>
              <Input
                id="coach-habit-time"
                type="time"
                value={timeOfDay}
                onChange={(event) => setTimeOfDay(event.target.value)}
                className="w-32"
              />
            </div>
          )}
          {effectiveTrigger === "bedtime_cutoff" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coach-habit-bedtime">Default bedtime</Label>
                <Input
                  id="coach-habit-bedtime"
                  type="time"
                  value={bedtime}
                  onChange={(event) => setBedtime(event.target.value)}
                  className="w-32"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coach-habit-lead">
                  Default lead time (minutes)
                </Label>
                <Input
                  id="coach-habit-lead"
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
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
