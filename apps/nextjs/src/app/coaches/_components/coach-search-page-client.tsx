"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";

import type { CoachSpecialty } from "@gamer-health/validators";
import { Button } from "@gamer-health/ui/button";
import { Input } from "@gamer-health/ui/input";
import { Label } from "@gamer-health/ui/label";
import { COACH_SPECIALTIES, WEEKDAY_LABELS } from "@gamer-health/validators";

import type { CoachSearchFilters } from "../_lib/search-params";
import type { PickedGame } from "./game-filter-picker";
import { minutesFromTimeString, timeStringFromMinutes } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { buildCoachSearchQueryString, PAGE_SIZE } from "../_lib/search-params";
import { CoachResultCard } from "./coach-result-card";
import { GameFilterPicker } from "./game-filter-picker";
import { MyApplicationsPanel } from "./my-applications-panel";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function CoachSearchPageClient({
  initialInput,
  initialGame,
}: {
  initialInput: CoachSearchFilters & { limit: number; offset: number };
  initialGame: PickedGame | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();

  const [queryInput, setQueryInput] = useState(initialInput.query ?? "");
  const debouncedQuery = useDebouncedValue(queryInput, 300);
  const [game, setGame] = useState<PickedGame | null>(initialGame);
  const [specialties, setSpecialties] = useState<CoachSpecialty[]>(
    initialInput.specialties ?? [],
  );
  const [weekdays, setWeekdays] = useState<number[]>(
    initialInput.weekdays ?? [],
  );
  const [fromTime, setFromTime] = useState(
    initialInput.fromMinute !== undefined
      ? timeStringFromMinutes(initialInput.fromMinute)
      : "",
  );
  const [toTime, setToTime] = useState(
    initialInput.toMinute !== undefined
      ? timeStringFromMinutes(initialInput.toMinute)
      : "",
  );
  const [offset, setOffset] = useState(initialInput.offset);

  const fromMinute = fromTime ? minutesFromTimeString(fromTime) : undefined;
  const toMinute = toTime ? minutesFromTimeString(toTime) : undefined;

  function toggleSpecialty(specialty: CoachSpecialty) {
    setSpecialties((prev) =>
      prev.includes(specialty)
        ? prev.filter((s) => s !== specialty)
        : [...prev, specialty],
    );
  }
  function toggleWeekday(weekday: number) {
    setWeekdays((prev) =>
      prev.includes(weekday)
        ? prev.filter((w) => w !== weekday)
        : [...prev, weekday],
    );
  }

  // Reset to page 1 whenever a filter (anything but the page itself)
  // changes — skipped on the very first run so a shared "page 2" URL isn't
  // reset back to page 1 on load.
  const isFirstFilterEffect = useRef(true);
  useEffect(() => {
    if (isFirstFilterEffect.current) {
      isFirstFilterEffect.current = false;
      return;
    }
    setOffset(0);
  }, [debouncedQuery, game?.id, specialties, weekdays, fromTime, toTime]);

  // Keep every filter reflected in the URL query string (acceptance
  // criterion #2), so the current search is shareable/reloadable.
  useEffect(() => {
    const qs = buildCoachSearchQueryString({
      query: debouncedQuery.trim() || undefined,
      gameId: game?.id,
      gameName: game?.name,
      specialties: specialties.length > 0 ? specialties : undefined,
      weekdays: weekdays.length > 0 ? weekdays : undefined,
      fromMinute,
      toMinute,
      offset,
    });
    router.replace(qs ? `/coaches?${qs}` : "/coaches", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedQuery,
    game?.id,
    game?.name,
    specialties,
    weekdays,
    fromMinute,
    toMinute,
    offset,
  ]);

  const { data } = useSuspenseQuery(
    trpc.coaching.discovery.search.queryOptions({
      query: debouncedQuery.trim() || undefined,
      gameId: game?.id,
      specialties: specialties.length > 0 ? specialties : undefined,
      weekdays: weekdays.length > 0 ? weekdays : undefined,
      fromMinute,
      toMinute,
      limit: PAGE_SIZE,
      offset,
    }),
  );

  return (
    <div className="flex flex-col gap-8">
      <MyApplicationsPanel />

      <section>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="coach-search-query">Search</Label>
            <Input
              id="coach-search-query"
              placeholder="Name or headline"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              className="w-56"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Game</Label>
            <div className="w-56">
              <GameFilterPicker value={game} onChange={setGame} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="coach-search-from">Available from</Label>
            <Input
              id="coach-search-from"
              type="time"
              value={fromTime}
              onChange={(event) => setFromTime(event.target.value)}
              className="w-32"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="coach-search-to">Until</Label>
            <Input
              id="coach-search-to"
              type="time"
              value={toTime}
              onChange={(event) => setToTime(event.target.value)}
              className="w-32"
            />
          </div>
          {(game !== null ||
            fromTime !== "" ||
            toTime !== "" ||
            specialties.length > 0 ||
            weekdays.length > 0) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQueryInput("");
                setGame(null);
                setSpecialties([]);
                setWeekdays([]);
                setFromTime("");
                setToTime("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        <div className="mb-4 flex flex-col gap-1">
          <Label>Specialties</Label>
          <div className="flex flex-wrap gap-2">
            {COACH_SPECIALTIES.map((specialty) => (
              <Button
                key={specialty}
                type="button"
                size="sm"
                variant={
                  specialties.includes(specialty) ? "default" : "outline"
                }
                onClick={() => toggleSpecialty(specialty)}
              >
                {specialty}
              </Button>
            ))}
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-1">
          <Label>Available on</Label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((label, weekday) => (
              <Button
                key={weekday}
                type="button"
                size="sm"
                variant={weekdays.includes(weekday) ? "default" : "outline"}
                onClick={() => toggleWeekday(weekday)}
              >
                {label.slice(0, 3)}
              </Button>
            ))}
          </div>
        </div>

        {data.coaches.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            No coaches match these filters.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.coaches.map((coach) => (
              <CoachResultCard key={coach.userId} coach={coach} />
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </Button>
          <p className="text-muted-foreground text-sm">
            {data.total === 0
              ? "0 coaches"
              : `${offset + 1}–${Math.min(offset + PAGE_SIZE, data.total)} of ${data.total}`}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + PAGE_SIZE >= data.total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      </section>
    </div>
  );
}
