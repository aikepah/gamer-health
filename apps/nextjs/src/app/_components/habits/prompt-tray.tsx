"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@gamer-health/ui/button";

import { useTRPC } from "~/trpc/react";

const POLL_INTERVAL_MS = 60_000;

/**
 * Client-side generation-on-read poller: `habit.pendingPrompts` both
 * materializes due prompts and returns them (no background job runner — see
 * docs/features/habit-engine.md). Only runs while this component is mounted;
 * closing the tab means no more prompts until it's reopened.
 */
export function PromptTray() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const seenPromptIds = useRef(new Set<string>());

  const habitsQuery = useQuery(trpc.habit.list.queryOptions());
  const hasEnabledHabit = habitsQuery.data?.some((h) => h.enabled) ?? false;

  const pendingPrompts = useQuery({
    ...trpc.habit.pendingPrompts.queryOptions({}),
    refetchInterval: POLL_INTERVAL_MS,
  });
  const prompts = useMemo(
    () => pendingPrompts.data?.pending ?? [],
    [pendingPrompts.data],
  );

  const respond = useMutation(
    trpc.habit.respondPrompt.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.habit.pendingPrompts.queryKey(),
        });
      },
    }),
  );

  // Request notification permission only once the user has at least one
  // habit enabled — never prompt anonymous/new users on first load.
  useEffect(() => {
    if (!hasEnabledHabit) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [hasEnabledHabit]);

  // Fire a browser notification for any prompt id not seen before in this tab.
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    for (const prompt of prompts) {
      if (seenPromptIds.current.has(prompt.id)) continue;
      seenPromptIds.current.add(prompt.id);
      if (Notification.permission === "granted") {
        new Notification(prompt.title, { body: prompt.promptText });
      }
    }
  }, [prompts]);

  if (prompts.length === 0) {
    return null;
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      {prompts.map((prompt) => (
        <div
          key={prompt.id}
          className="border-border bg-card flex items-center justify-between gap-4 rounded-lg border p-3"
        >
          <div>
            <p className="text-sm font-medium">{prompt.promptText}</p>
            <p className="text-muted-foreground text-xs">
              Due {new Date(prompt.dueAt).toLocaleTimeString()}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={respond.isPending}
              onClick={() =>
                respond.mutate({ promptId: prompt.id, response: "skipped" })
              }
            >
              Skip
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={respond.isPending}
              onClick={() =>
                respond.mutate({ promptId: prompt.id, response: "done" })
              }
            >
              Done
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
