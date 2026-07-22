"use client";

import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";

import { Button } from "@gamer-health/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@gamer-health/ui/tabs";

import { CancelSessionDialog } from "~/app/_components/coaching/cancel-session-dialog";
import { SessionItem } from "~/app/_components/coaching/session-item";
import { authClient } from "~/auth/client";
import { useTRPC } from "~/trpc/react";

/**
 * Player's own coaching-sessions list (#15): Upcoming / Past, with Cancel on
 * a still-live `proposed`/`confirmed` row. Reuses `coaching.sessions.list`
 * (the same query the coach side uses) — the caller's own player/coach
 * identity decides which party's name to show as "the other side".
 */
export function SessionsListPanel() {
  const trpc = useTRPC();
  const { data: session } = authClient.useSession();
  const viewerUserId = session?.user.id;

  const { data: upcoming } = useSuspenseQuery(
    trpc.coaching.sessions.list.queryOptions({ scope: "upcoming", limit: 50 }),
  );
  const { data: past } = useSuspenseQuery(
    trpc.coaching.sessions.list.queryOptions({ scope: "past", limit: 50 }),
  );

  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  return (
    <Tabs defaultValue="upcoming">
      <TabsList>
        <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
        <TabsTrigger value="past">Past</TabsTrigger>
      </TabsList>

      <TabsContent value="upcoming" className="mt-6">
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground text-sm">No upcoming sessions.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((row) => (
              <SessionItem
                key={row.id}
                session={row}
                viewerUserId={viewerUserId}
                otherPartyLabel={
                  viewerUserId === row.playerUserId
                    ? row.coach.name
                    : row.player.name
                }
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
      </TabsContent>

      <TabsContent value="past" className="mt-6">
        {past.length === 0 ? (
          <p className="text-muted-foreground text-sm">No past sessions.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {past.map((row) => (
              <SessionItem
                key={row.id}
                session={row}
                viewerUserId={viewerUserId}
                otherPartyLabel={
                  viewerUserId === row.playerUserId
                    ? row.coach.name
                    : row.player.name
                }
              />
            ))}
          </ul>
        )}
      </TabsContent>

      <CancelSessionDialog
        sessionId={cancelTarget}
        title="Cancel this session?"
        description="They'll see this was cancelled. This can't be undone."
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
      />
    </Tabs>
  );
}
