"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Input } from "@gamer-health/ui/input";

import { useTRPC } from "~/trpc/react";

export interface PickedGame {
  id: string;
  name: string;
}

export interface GamePickerProps {
  value: PickedGame | null;
  onChange: (game: PickedGame) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Autocomplete over the game catalog (`game.search`), with a "create «name»"
 * option (`game.getOrCreate`) when the typed name has no exact match.
 */
export function GamePicker({
  value,
  onChange,
  disabled,
  placeholder,
}: GamePickerProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState(value?.name ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the input text in sync when the selected value changes from
  // *outside* this component (e.g. an edit form initializing with an
  // existing game). Adjusting state during render (rather than in an
  // effect) avoids an extra cascading render — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [syncedValueId, setSyncedValueId] = useState(value?.id);
  if (value?.id !== syncedValueId) {
    setSyncedValueId(value?.id);
    setQuery(value?.name ?? "");
  }

  const searchQuery = useQuery({
    ...trpc.game.search.queryOptions({ query, limit: 10 }),
    enabled: isOpen,
  });

  const getOrCreate = useMutation(trpc.game.getOrCreate.mutationOptions());

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const results = searchQuery.data ?? [];
  const trimmed = query.trim();
  const hasExactMatch = results.some(
    (game) => game.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const showCreateOption = trimmed.length > 0 && !hasExactMatch;

  async function handleCreate() {
    if (!trimmed) return;
    const game = await getOrCreate.mutateAsync({ name: trimmed });
    await queryClient.invalidateQueries({
      queryKey: trpc.game.search.queryKey(),
    });
    onChange({ id: game.id, name: game.name });
    setQuery(game.name);
    setIsOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <Input
        value={query}
        disabled={disabled}
        placeholder={placeholder ?? "Search for a game…"}
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
      />
      {isOpen && (
        <div className="bg-popover text-popover-foreground absolute z-50 mt-1 w-full rounded-md border shadow-md">
          <ul className="max-h-56 overflow-y-auto py-1">
            {results.map((game) => (
              <li key={game.id}>
                <button
                  type="button"
                  className="hover:bg-accent hover:text-accent-foreground w-full px-3 py-1.5 text-left text-sm"
                  onClick={() => {
                    onChange({ id: game.id, name: game.name });
                    setQuery(game.name);
                    setIsOpen(false);
                  }}
                >
                  {game.name}
                  {game.platform && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {game.platform}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {showCreateOption && (
              <li>
                <button
                  type="button"
                  className="text-primary hover:bg-accent w-full px-3 py-1.5 text-left text-sm"
                  disabled={getOrCreate.isPending}
                  onClick={() => void handleCreate()}
                >
                  {getOrCreate.isPending ? "Creating…" : `Create "${trimmed}"`}
                </button>
              </li>
            )}
            {results.length === 0 && !showCreateOption && (
              <li className="text-muted-foreground px-3 py-1.5 text-sm">
                No games found
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
