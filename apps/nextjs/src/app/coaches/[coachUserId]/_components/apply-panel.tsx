"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import { Button } from "@gamer-health/ui/button";
import { Label } from "@gamer-health/ui/label";
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";

/**
 * Apply / application-status panel for a coach's detail page (#10). State
 * derives from `myApplications` (the same data source as the `/coaches`
 * "Your applications" panel), matched to this coach:
 *   - no row, or a terminal row (declined/withdrawn/ended) -> Apply
 *   - `applied`                                            -> Pending + Withdraw
 *   - `acceptingApplications: false` on the coach           -> disabled, no form
 *
 * There's no `active` branch here: `listMyApplications` deliberately
 * excludes `active` rows (that's #11's "my coach" card), and nothing in this
 * feature can produce one — #11 ships the accept flow that would.
 */
export function ApplyPanel({
  coachUserId,
  isSelf,
}: {
  coachUserId: string;
  isSelf: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: profile } = useSuspenseQuery(
    trpc.coaching.profile.getPublic.queryOptions({ coachUserId }),
  );
  const { data: applications } = useSuspenseQuery(
    trpc.coaching.discovery.myApplications.queryOptions(),
  );

  const [message, setMessage] = useState("");

  function invalidateAll() {
    void queryClient.invalidateQueries({
      queryKey: trpc.coaching.discovery.myApplications.queryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: trpc.coaching.discovery.search.queryKey(),
    });
  }

  const apply = useMutation(
    trpc.coaching.discovery.apply.mutationOptions({
      onSuccess: () => {
        toast.success("Application sent");
        setMessage("");
        invalidateAll();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to apply");
      },
    }),
  );
  const withdraw = useMutation(
    trpc.coaching.discovery.withdraw.mutationOptions({
      onSuccess: () => {
        toast.success("Application withdrawn");
        invalidateAll();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to withdraw");
      },
    }),
  );

  if (isSelf) {
    return null;
  }

  const myApp = applications.find((a) => a.coach.userId === coachUserId);

  if (!profile.acceptingApplications) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <p className="text-muted-foreground text-sm">
          Not accepting new players
        </p>
      </div>
    );
  }

  if (myApp?.status === "applied") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm">
          <span className="font-medium">Application pending.</span> This coach
          hasn't responded yet.
        </p>
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={withdraw.isPending}
            onClick={() =>
              withdraw.mutate({ relationshipId: myApp.relationshipId })
            }
          >
            Withdraw application
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      {myApp?.status === "declined" && (
        <p className="text-muted-foreground text-xs">
          This coach declined your last application.
        </p>
      )}
      {myApp?.status === "withdrawn" && (
        <p className="text-muted-foreground text-xs">
          You withdrew your last application.
        </p>
      )}
      {myApp?.status === "ended" && (
        <p className="text-muted-foreground text-xs">
          Your last coaching relationship with them ended.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="apply-message">Message (optional)</Label>
        <textarea
          id="apply-message"
          rows={3}
          maxLength={1000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Tell them a bit about what you're looking for…"
          className="border-input placeholder:text-muted-foreground w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm"
        />
      </div>
      <div>
        <Button
          disabled={apply.isPending}
          onClick={() =>
            apply.mutate({
              coachUserId,
              message: message.trim().length > 0 ? message.trim() : undefined,
            })
          }
        >
          {apply.isPending ? "Applying…" : myApp ? "Apply again" : "Apply"}
        </Button>
      </div>
    </div>
  );
}
