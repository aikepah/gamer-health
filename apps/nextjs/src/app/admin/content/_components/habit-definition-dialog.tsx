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

type HabitDefinitionRow =
  RouterOutputs["admin"]["content"]["listHabitDefinitions"][number];

const TRIGGER_LABELS: Record<HabitTriggerType, string> = {
  session_interval: "Session interval",
  daily_schedule: "Daily schedule",
  bedtime_cutoff: "Bedtime cutoff",
};

/**
 * Create/edit dialog for a habit definition. `triggerType` is only settable
 * on create (immutable after — see docs/features/admin-content.md) so edit
 * mode shows it locked. Config fields switch on the (locked-once-chosen)
 * trigger type, mirroring `/habits`' HabitCard pattern.
 */
export function HabitDefinitionDialog({
  definition,
  open,
  onOpenChange,
}: {
  /** null = create mode. */
  definition: HabitDefinitionRow | null;
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
      queryKey: trpc.admin.content.listHabitDefinitions.queryKey(),
    });
  }

  const create = useMutation(
    trpc.admin.content.createHabitDefinition.mutationOptions({
      onSuccess: () => {
        toast.success("Habit definition created");
        invalidate();
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create habit definition");
      },
    }),
  );

  const update = useMutation(
    trpc.admin.content.updateHabitDefinition.mutationOptions({
      onSuccess: () => {
        toast.success("Habit definition saved");
        invalidate();
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to save habit definition");
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
          <DialogTitle>
            {isEdit ? "Edit habit definition" : "New default habit"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Edits apply to future prompts only."
              : "Offered to every player in the /habits catalog."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="habit-def-title">Title</Label>
            <Input
              id="habit-def-title"
              required
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="habit-def-description">Description</Label>
            <Input
              id="habit-def-description"
              required
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="habit-def-prompt">Prompt text</Label>
            <Input
              id="habit-def-prompt"
              required
              maxLength={200}
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="habit-def-trigger">Trigger type</Label>
            {isEdit ? (
              <p className="text-muted-foreground text-sm">
                {TRIGGER_LABELS[effectiveTrigger]} (locked after creation)
              </p>
            ) : (
              <select
                id="habit-def-trigger"
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
              <Label htmlFor="habit-def-interval">
                Default interval (minutes)
              </Label>
              <Input
                id="habit-def-interval"
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
              <Label htmlFor="habit-def-time">Default time of day</Label>
              <Input
                id="habit-def-time"
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
                <Label htmlFor="habit-def-bedtime">Default bedtime</Label>
                <Input
                  id="habit-def-bedtime"
                  type="time"
                  value={bedtime}
                  onChange={(event) => setBedtime(event.target.value)}
                  className="w-32"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="habit-def-lead">
                  Default lead time (minutes)
                </Label>
                <Input
                  id="habit-def-lead"
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
