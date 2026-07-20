"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@gamer-health/ui/input";

import { useTRPC } from "~/trpc/react";

export interface PickedGame {
  id: string;
  name: string;
}

/**
 * Read-only autocomplete over the game catalog for the discovery filter bar
 * — deliberately does NOT offer #9's "create a new game" option (`GamePicker`
 * in `~/app/_components/sessions/game-picker`), since typing a filter query
 * that doesn't match anything should never have the side effect of writing a
 * new catalog row.
 */
export function GameFilterPicker({
  value,
  onChange,
}: {
  value: PickedGame | null;
  onChange: (game: PickedGame | null) => void;
}) {
  const trpc = useTRPC();
  const [query, setQuery] = useState(value?.name ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the input text in sync when the selected value changes from
  // outside this component (e.g. the URL-derived initial filter).
  const [syncedValueId, setSyncedValueId] = useState(value?.id);
  if (value?.id !== syncedValueId) {
    setSyncedValueId(value?.id);
    setQuery(value?.name ?? "");
  }

  const trimmed = query.trim();
  const searchQuery = useQuery({
    ...trpc.game.search.queryOptions({ query: trimmed, limit: 10 }),
    enabled: isOpen && trimmed.length > 0,
  });

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

  return (
    <div className="relative" ref={containerRef}>
      <Input
        value={query}
        placeholder="Filter by game…"
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setIsOpen(true);
          if (next.trim().length === 0) {
            onChange(null);
          }
        }}
      />
      {isOpen && trimmed.length > 0 && (
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
            {results.length === 0 && (
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
