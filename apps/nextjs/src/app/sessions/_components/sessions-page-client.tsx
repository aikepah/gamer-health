"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import { Button } from "@gamer-health/ui/button";
import { Input } from "@gamer-health/ui/input";
import { Label } from "@gamer-health/ui/label";
import { toast } from "@gamer-health/ui/toast";

import type { PickedGame } from "~/app/_components/sessions/game-picker";
import { GamePicker } from "~/app/_components/sessions/game-picker";
import {
  formatDuration,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "~/lib/format";
import { useTRPC } from "~/trpc/react";

interface SessionFormValues {
  game: PickedGame | null;
  startedAt: string;
  endedAt: string;
  notes: string;
}

function SessionForm({
  initial,
  submitLabel,
  pending,
  onCancel,
  onSubmit,
}: {
  initial: SessionFormValues;
  submitLabel: string;
  pending: boolean;
  onCancel?: () => void;
  onSubmit: (values: {
    gameId: string;
    startedAt: Date;
    endedAt: Date;
    notes: string;
  }) => void;
}) {
  const [game, setGame] = useState<PickedGame | null>(initial.game);
  const [startedAt, setStartedAt] = useState(initial.startedAt);
  const [endedAt, setEndedAt] = useState(initial.endedAt);
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!game) {
      setError("Pick a game");
      return;
    }
    onSubmit({
      gameId: game.id,
      startedAt: fromDatetimeLocalValue(startedAt),
      endedAt: fromDatetimeLocalValue(endedAt),
      notes,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label>Game</Label>
        <GamePicker value={game} onChange={setGame} />
      </div>
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="session-start">Start</Label>
          <Input
            id="session-start"
            type="datetime-local"
            required
            value={startedAt}
            onChange={(event) => setStartedAt(event.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="session-end">End</Label>
          <Input
            id="session-end"
            type="datetime-local"
            required
            value={endedAt}
            onChange={(event) => setEndedAt(event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="session-notes">Notes</Label>
        <textarea
          id="session-notes"
          rows={2}
          maxLength={2000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="border-input placeholder:text-muted-foreground w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm"
        />
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export function SessionsPageClient({ pageSize }: { pageSize: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data } = useSuspenseQuery(
    trpc.gameSession.list.queryOptions({ limit: pageSize, offset }),
  );

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.gameSession.list.queryKey(),
    });

  const logSession = useMutation(
    trpc.gameSession.log.mutationOptions({
      onSuccess: () => {
        toast.success("Session logged. +10 XP");
        void invalidateList();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to log session");
      },
    }),
  );

  const updateSession = useMutation(
    trpc.gameSession.update.mutationOptions({
      onSuccess: () => {
        toast.success("Session updated");
        setEditingId(null);
        void invalidateList();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update session");
      },
    }),
  );

  const deleteSession = useMutation(
    trpc.gameSession.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Session deleted");
        void invalidateList();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete session");
      },
    }),
  );

  // Computed once at mount (not on every render) as the default retro-log
  // window: a one-hour session ending now.
  const [defaultTimes] = useState(() => ({
    startedAt: toDatetimeLocalValue(new Date(Date.now() - 60 * 60 * 1000)),
    endedAt: toDatetimeLocalValue(new Date()),
  }));

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Log a past session</h2>
        <SessionForm
          initial={{
            game: null,
            startedAt: defaultTimes.startedAt,
            endedAt: defaultTimes.endedAt,
            notes: "",
          }}
          submitLabel="Log session"
          pending={logSession.isPending}
          onSubmit={(values) => logSession.mutate(values)}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">History</h2>
        {data.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No sessions logged yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.items.map((session) => {
              if (editingId === session.id) {
                return (
                  <li key={session.id} className="rounded-lg border p-4">
                    <SessionForm
                      initial={{
                        game: { id: session.game.id, name: session.game.name },
                        startedAt: toDatetimeLocalValue(
                          new Date(session.startedAt),
                        ),
                        endedAt: toDatetimeLocalValue(
                          new Date(session.endedAt ?? session.startedAt),
                        ),
                        notes: session.notes ?? "",
                      }}
                      submitLabel="Save"
                      pending={updateSession.isPending}
                      onCancel={() => setEditingId(null)}
                      onSubmit={(values) =>
                        updateSession.mutate({ id: session.id, ...values })
                      }
                    />
                  </li>
                );
              }

              const durationMs = session.endedAt
                ? new Date(session.endedAt).getTime() -
                  new Date(session.startedAt).getTime()
                : 0;

              return (
                <li
                  key={session.id}
                  className="flex items-start justify-between gap-4 rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium">{session.game.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {new Date(session.startedAt).toLocaleString()} ·{" "}
                      {formatDuration(durationMs)}
                    </p>
                    {session.notes && (
                      <p className="mt-1 text-sm">{session.notes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(session.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deleteSession.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete this ${session.game.name} session?`,
                          )
                        ) {
                          deleteSession.mutate({ id: session.id });
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
          >
            Previous
          </Button>
          <p className="text-muted-foreground text-sm">
            {data.total === 0
              ? "0 sessions"
              : `${offset + 1}–${Math.min(offset + pageSize, data.total)} of ${data.total}`}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + pageSize >= data.total}
            onClick={() => setOffset(offset + pageSize)}
          >
            Next
          </Button>
        </div>
      </section>
    </div>
  );
}
