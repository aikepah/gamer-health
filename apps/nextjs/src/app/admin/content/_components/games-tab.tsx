"use client";

import { useEffect, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import type { RouterOutputs } from "@gamer-health/api";
import { Button } from "@gamer-health/ui/button";
import { Input } from "@gamer-health/ui/input";
import { Label } from "@gamer-health/ui/label";
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";
import { MergeGameDialog } from "./merge-game-dialog";
import { RenameGameDialog } from "./rename-game-dialog";

type GameRow = RouterOutputs["admin"]["content"]["listGames"]["games"][number];

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function GamesTab({ pageSize }: { pageSize: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [queryInput, setQueryInput] = useState("");
  const debouncedQuery = useDebouncedValue(queryInput, 300);
  const [offset, setOffset] = useState(0);

  const [appliedQuery, setAppliedQuery] = useState(debouncedQuery);
  if (appliedQuery !== debouncedQuery) {
    setAppliedQuery(debouncedQuery);
    setOffset(0);
  }

  const { data } = useSuspenseQuery(
    trpc.admin.content.listGames.queryOptions({
      query: debouncedQuery || undefined,
      limit: pageSize,
      offset,
    }),
  );

  const [renameTarget, setRenameTarget] = useState<GameRow | null>(null);
  const [mergeTarget, setMergeTarget] = useState<GameRow | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: trpc.admin.content.listGames.queryKey(),
    });
  }

  const deleteGame = useMutation(
    trpc.admin.content.deleteGame.mutationOptions({
      onSuccess: () => {
        toast.success("Game deleted");
        invalidate();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete game");
      },
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="game-search">Search</Label>
        <Input
          id="game-search"
          placeholder="Game name"
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          className="w-64"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Platform</th>
              <th className="p-3 font-medium">Steam app id</th>
              <th className="p-3 font-medium">Sessions</th>
              <th className="p-3 font-medium">Created</th>
              <th className="p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.games.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">{row.name}</td>
                <td className="p-3">{row.platform ?? "—"}</td>
                <td className="p-3">{row.steamAppId ?? "—"}</td>
                <td className="p-3">{row.sessionCount}</td>
                <td className="p-3">
                  {new Date(row.createdAt).toLocaleDateString()}
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRenameTarget(row)}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMergeTarget(row)}
                    >
                      Merge
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={row.sessionCount > 0 || deleteGame.isPending}
                      title={
                        row.sessionCount > 0
                          ? "This game has logged sessions — merge it into another game instead"
                          : undefined
                      }
                      onClick={() => {
                        if (window.confirm(`Delete "${row.name}"?`)) {
                          deleteGame.mutate({ gameId: row.id });
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {data.games.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="text-muted-foreground p-6 text-center"
                >
                  No games match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
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
            ? "0 games"
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

      <RenameGameDialog
        game={renameTarget}
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      />
      <MergeGameDialog
        game={mergeTarget}
        open={mergeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMergeTarget(null);
        }}
      />
    </div>
  );
}
