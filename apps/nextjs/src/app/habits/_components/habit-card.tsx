"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@gamer-health/api";
import { Button } from "@gamer-health/ui/button";
import { Input } from "@gamer-health/ui/input";
import { Label } from "@gamer-health/ui/label";
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";

type HabitItem = RouterOutputs["habit"]["list"][number];

/** One catalog habit: enable switch + kind-specific config inputs + Save. */
export function HabitCard({ item }: { item: HabitItem }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [enabled, setEnabled] = useState(item.enabled);
  const [intervalMinutes, setIntervalMinutes] = useState(
    item.config.intervalMinutes ?? 30,
  );
  const [timeOfDay, setTimeOfDay] = useState(item.config.timeOfDay ?? "17:00");
  const [bedtime, setBedtime] = useState(item.config.bedtime ?? "23:00");
  const [leadMinutes, setLeadMinutes] = useState(
    item.config.leadMinutes ?? 60,
  );

  const upsert = useMutation(
    trpc.habit.upsert.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.habit.list.queryKey(),
        });
        toast.success(`${item.title} saved`);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to save habit");
      },
    }),
  );

  function handleSave() {
    if (item.triggerType === "session_interval") {
      upsert.mutate({
        kind: item.kind,
        enabled,
        config: { intervalMinutes },
      });
      return;
    }
    if (item.kind === "daily_movement") {
      upsert.mutate({ kind: item.kind, enabled, config: { timeOfDay } });
      return;
    }
    // item.kind === "bedtime_cutoff"
    upsert.mutate({
      kind: item.kind,
      enabled,
      config: { bedtime, leadMinutes },
    });
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{item.title}</p>
          <p className="text-muted-foreground text-sm">{item.description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={enabled ? "default" : "outline"}
          aria-pressed={enabled}
          onClick={() => setEnabled((v) => !v)}
        >
          {enabled ? "Enabled" : "Disabled"}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        {item.triggerType === "session_interval" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${item.kind}-interval`}>Every (minutes)</Label>
            <Input
              id={`${item.kind}-interval`}
              type="number"
              min={5}
              max={240}
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              className="w-28"
            />
          </div>
        )}

        {item.kind === "daily_movement" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="daily_movement-time">Time of day</Label>
            <Input
              id="daily_movement-time"
              type="time"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
              className="w-32"
            />
          </div>
        )}

        {item.kind === "bedtime_cutoff" && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bedtime_cutoff-bedtime">Bedtime</Label>
              <Input
                id="bedtime_cutoff-bedtime"
                type="time"
                value={bedtime}
                onChange={(e) => setBedtime(e.target.value)}
                className="w-32"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bedtime_cutoff-lead">Lead time (minutes)</Label>
              <Input
                id="bedtime_cutoff-lead"
                type="number"
                min={0}
                max={240}
                value={leadMinutes}
                onChange={(e) => setLeadMinutes(Number(e.target.value))}
                className="w-28"
              />
            </div>
          </>
        )}

        <Button
          type="button"
          size="sm"
          disabled={upsert.isPending}
          onClick={handleSave}
        >
          {upsert.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
