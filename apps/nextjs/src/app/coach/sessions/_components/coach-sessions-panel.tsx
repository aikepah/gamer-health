"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import { Button } from "@gamer-health/ui/button";
import { toast } from "@gamer-health/ui/toast";

import { CancelSessionDialog } from "~/app/_components/coaching/cancel-session-dialog";
import { SessionItem } from "~/app/_components/coaching/session-item";
import { authClient } from "~/auth/client";
import { useTRPC } from "~/trpc/react";

/**
 * Coach's sessions page (#15): pending proposals (Confirm/Decline), upcoming
 * confirmed sessions, and past sessions with a Mark completed action on a
 * still-`confirmed` row whose time has passed.
 */
export function CoachSessionsPanel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const viewerUserId = session?.user.id;

  const { data: upcoming } = useSuspenseQuery(
    trpc.coaching.sessions.list.queryOptions({ scope: "upcoming", limit: 50 }),
  );
  const { data: past } = useSuspenseQuery(
    trpc.coaching.sessions.list.queryOptions({ scope: "past", limit: 50 }),
  );

  const proposals = upcoming.filter((row) => row.status === "proposed");
  const confirmed = upcoming.filter((row) => row.status === "confirmed");

  const [declineTarget, setDeclineTarget] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  function invalidateSessions() {
    void queryClient.invalidateQueries({
      queryKey: trpc.coaching.sessions.list.queryKey(),
    });
  }

  const confirmMutation = useMutation(
    trpc.coaching.sessions.confirm.mutationOptions({
      onSuccess: () => {
        toast.success("Session confirmed");
        invalidateSessions();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to confirm that session");
      },
    }),
  );

  const markCompleted = useMutation(
    trpc.coaching.sessions.markCompleted.mutationOptions({
      onSuccess: () => {
        toast.success("Session marked completed");
        invalidateSessions();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to mark that session completed");
      },
    }),
  );

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Proposals{" "}
          {proposals.length > 0 && (
            <span className="text-muted-foreground text-sm font-normal">
              ({proposals.length})
            </span>
          )}
        </h2>
        {proposals.length === 0 ? (
          <p className="text-muted-foreground text-sm">No pending proposals.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {proposals.map((row) => (
              <SessionItem
                key={row.id}
                session={row}
                viewerUserId={viewerUserId}
                otherPartyLabel={row.player.name}
                actions={
                  <>
                    <Button
                      size="sm"
                      disabled={confirmMutation.isPending}
                      onClick={() =>
                        confirmMutation.mutate({ sessionId: row.id })
                      }
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeclineTarget(row.id)}
                    >
                      Decline
                    </Button>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Upcoming{" "}
          {confirmed.length > 0 && (
            <span className="text-muted-foreground text-sm font-normal">
              ({confirmed.length})
            </span>
          )}
        </h2>
        {confirmed.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No upcoming confirmed sessions.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {confirmed.map((row) => (
              <SessionItem
                key={row.id}
                session={row}
                viewerUserId={viewerUserId}
                otherPartyLabel={row.player.name}
                actions={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCancelTarget(row.id)}
                  >
                    Cancel
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Past</h2>
        {past.length === 0 ? (
          <p className="text-muted-foreground text-sm">No past sessions.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {past.map((row) => (
              <SessionItem
                key={row.id}
                session={row}
                viewerUserId={viewerUserId}
                otherPartyLabel={row.player.name}
                actions={
                  row.status === "confirmed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={markCompleted.isPending}
                      onClick={() =>
                        markCompleted.mutate({ sessionId: row.id })
                      }
                    >
                      Mark completed
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </ul>
        )}
      </section>

      <CancelSessionDialog
        sessionId={declineTarget}
        title="Decline this proposal?"
        description="The player will see this was declined. This can't be undone."
        open={declineTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeclineTarget(null);
        }}
      />
      <CancelSessionDialog
        sessionId={cancelTarget}
        title="Cancel this session?"
        description="The player will see this was cancelled. This can't be undone."
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
      />
    </div>
  );
}
