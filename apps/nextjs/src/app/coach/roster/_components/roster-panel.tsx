"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import { Button } from "@gamer-health/ui/button";
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";
import { DeclineDialog } from "./decline-dialog";

/**
 * Coach roster (#11): a pending-applications inbox (Accept/Decline) and the
 * active-player roster. All state lives in `coaching.relationships.roster`
 * (queried twice, once per status) — see docs/features/coaching-relationships.md.
 */
export function RosterPanel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: applications } = useSuspenseQuery(
    trpc.coaching.relationships.roster.queryOptions({ status: "applied" }),
  );
  const { data: roster } = useSuspenseQuery(
    trpc.coaching.relationships.roster.queryOptions({ status: "active" }),
  );

  const [declineTarget, setDeclineTarget] = useState<{
    relationshipId: string;
    name: string;
  } | null>(null);

  function invalidateRoster() {
    void queryClient.invalidateQueries({
      queryKey: trpc.coaching.relationships.roster.queryKey(),
    });
  }

  const accept = useMutation(
    trpc.coaching.relationships.accept.mutationOptions({
      onSuccess: () => {
        toast.success("Application accepted — they're on your roster now");
        invalidateRoster();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to accept application");
      },
    }),
  );

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Applications{" "}
          {applications.length > 0 && (
            <span className="text-muted-foreground text-sm font-normal">
              ({applications.length})
            </span>
          )}
        </h2>
        {applications.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No pending applications.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {applications.map((entry) => (
              <li
                key={entry.relationshipId}
                className="flex flex-col gap-2 rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{entry.player.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {entry.player.email}
                    </p>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Applied {new Date(entry.appliedAt).toLocaleDateString()}
                  </p>
                </div>
                {entry.message && <p className="text-sm">{entry.message}</p>}
                <div className="mt-1 flex gap-2">
                  <Button
                    size="sm"
                    disabled={accept.isPending}
                    onClick={() =>
                      accept.mutate({ relationshipId: entry.relationshipId })
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={accept.isPending}
                    onClick={() =>
                      setDeclineTarget({
                        relationshipId: entry.relationshipId,
                        name: entry.player.name,
                      })
                    }
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Roster{" "}
          {roster.length > 0 && (
            <span className="text-muted-foreground text-sm font-normal">
              ({roster.length})
            </span>
          )}
        </h2>
        {roster.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No active players yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {roster.map((entry) => (
              <li key={entry.relationshipId}>
                <Link
                  href={`/coach/players/${entry.player.userId}`}
                  className="hover:bg-accent flex items-center justify-between gap-4 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{entry.player.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {entry.player.email}
                    </p>
                  </div>
                  {entry.startedAt && (
                    <p className="text-muted-foreground text-xs">
                      Coaching since{" "}
                      {new Date(entry.startedAt).toLocaleDateString()}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DeclineDialog
        relationshipId={declineTarget?.relationshipId ?? null}
        applicantName={declineTarget?.name ?? ""}
        open={declineTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeclineTarget(null);
        }}
      />
    </div>
  );
}
