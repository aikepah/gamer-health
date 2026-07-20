"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import { Button } from "@gamer-health/ui/button";
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";

/**
 * "Your applications" panel (#10, acceptance criterion 7): the caller's own
 * pending (`status: 'applied'`) applications, each withdrawable. Terminal
 * rows (declined/ended/withdrawn) aren't shown here — they don't need an
 * action, and `listMyApplications` is the same data source the coach detail
 * page's apply-panel uses to compute state.
 */
export function MyApplicationsPanel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(
    trpc.coaching.discovery.myApplications.queryOptions(),
  );

  const withdraw = useMutation(
    trpc.coaching.discovery.withdraw.mutationOptions({
      onSuccess: () => {
        toast.success("Application withdrawn");
        void queryClient.invalidateQueries({
          queryKey: trpc.coaching.discovery.myApplications.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.coaching.discovery.search.queryKey(),
        });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to withdraw application");
      },
    }),
  );

  const pending = data.filter((row) => row.status === "applied");
  if (pending.length === 0) {
    return null;
  }

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold">Your applications</h2>
      <ul className="flex flex-col gap-2">
        {pending.map((row) => (
          <li
            key={row.relationshipId}
            className="flex items-center justify-between gap-4 rounded-lg border p-3"
          >
            <div>
              <p className="font-medium">{row.coach.name}</p>
              {row.coach.headline && (
                <p className="text-muted-foreground text-sm">
                  {row.coach.headline}
                </p>
              )}
              <p className="text-muted-foreground text-xs">
                Applied {new Date(row.appliedAt).toLocaleDateString()}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={withdraw.isPending}
              onClick={() =>
                withdraw.mutate({ relationshipId: row.relationshipId })
              }
            >
              Withdraw
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
