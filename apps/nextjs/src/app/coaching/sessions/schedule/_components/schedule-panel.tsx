"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";

import { Button } from "@gamer-health/ui/button";
import { Label } from "@gamer-health/ui/label";
import { toast } from "@gamer-health/ui/toast";

import { localDateParts, zonedWallTimeToUtc } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

const DURATIONS = [30, 45, 60] as const;
const DAYS_AHEAD = 14;
const SLOT_STEP_MINUTES = 30;

interface Slot {
  startsAt: Date;
  endsAt: Date;
  busy: boolean;
}

interface DayGroup {
  label: string;
  slots: Slot[];
}

function buildSlots(
  availability: { weekday: number; startMinute: number; endMinute: number }[],
  busy: { startsAt: Date; endsAt: Date }[],
  durationMinutes: number,
  coachTimezone: string,
): DayGroup[] {
  const now = new Date();
  const base = localDateParts(now, coachTimezone);
  const groups: DayGroup[] = [];

  for (let offset = 0; offset < DAYS_AHEAD; offset++) {
    // Pure calendar-day arithmetic via a UTC-anchored Date — no timezone
    // conversion happening here, just Y/M/D + offset (Date.UTC normalizes
    // month/day overflow correctly).
    const calendarDay = new Date(
      Date.UTC(base.year, base.month - 1, base.day + offset),
    );
    const weekday = calendarDay.getUTCDay();
    const year = calendarDay.getUTCFullYear();
    const month = calendarDay.getUTCMonth() + 1;
    const day = calendarDay.getUTCDate();

    const blocksForDay = availability.filter((b) => b.weekday === weekday);
    const daySlots: Slot[] = [];
    for (const block of blocksForDay) {
      for (
        let minute = block.startMinute;
        minute + durationMinutes <= block.endMinute;
        minute += SLOT_STEP_MINUTES
      ) {
        const startsAt = zonedWallTimeToUtc(
          year,
          month,
          day,
          minute,
          coachTimezone,
        );
        if (startsAt.getTime() <= now.getTime()) continue;
        const endsAt = zonedWallTimeToUtc(
          year,
          month,
          day,
          minute + durationMinutes,
          coachTimezone,
        );
        const isBusy = busy.some(
          (b) => startsAt < new Date(b.endsAt) && endsAt > new Date(b.startsAt),
        );
        daySlots.push({ startsAt, endsAt, busy: isBusy });
      }
    }

    if (daySlots.length > 0) {
      const label = calendarDay.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      groups.push({ label, slots: daySlots });
    }
  }

  return groups;
}

/**
 * The player's slot picker (#15): next-14-days availability (minus the
 * coach's confirmed bookings, greyed out), a duration select, an optional
 * agenda note, and submit. Slot generation here is a client-side
 * convenience only — `packages/core`'s `proposeCoachingSession` re-derives
 * and enforces the real containment/overlap checks regardless.
 */
export function SchedulePanel() {
  const trpc = useTRPC();
  const router = useRouter();
  const { data: context } = useSuspenseQuery(
    trpc.coaching.sessions.schedulingContext.queryOptions(),
  );

  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(30);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [note, setNote] = useState("");

  const dayGroups = useMemo(
    () =>
      buildSlots(
        context.availability,
        context.busy,
        duration,
        context.coach.timezone,
      ),
    [context, duration],
  );

  const propose = useMutation(
    trpc.coaching.sessions.propose.mutationOptions({
      onSuccess: () => {
        toast.success("Session proposed — your coach will confirm it soon");
        router.push("/coaching/sessions");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to propose that session");
      },
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm">
          Scheduling with{" "}
          <span className="font-medium">{context.coach.name}</span>
        </p>
        <p className="text-muted-foreground text-xs">
          Their availability is in {context.coach.timezone}; times below show in
          your own timezone.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="duration">Duration</Label>
        <select
          id="duration"
          value={duration}
          onChange={(event) => {
            setSelected(null);
            setDuration(
              Number(event.target.value) as (typeof DURATIONS)[number],
            );
          }}
          className="border-input w-40 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
        >
          {DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d} minutes
            </option>
          ))}
        </select>
      </div>

      {dayGroups.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No available slots in the next {DAYS_AHEAD} days for that duration.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {dayGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 text-sm font-medium">{group.label}</p>
              <div className="flex flex-wrap gap-2">
                {group.slots.map((slot) => {
                  const isSelected =
                    selected?.startsAt.getTime() === slot.startsAt.getTime();
                  return (
                    <button
                      key={slot.startsAt.toISOString()}
                      type="button"
                      disabled={slot.busy}
                      onClick={() => setSelected(slot)}
                      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                        slot.busy
                          ? "text-muted-foreground/50 cursor-not-allowed line-through"
                          : isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      {slot.startsAt.toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agenda-note">Agenda note (optional)</Label>
        <textarea
          id="agenda-note"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What would you like to cover?"
          className="border-input placeholder:text-muted-foreground w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm"
        />
      </div>

      <Button
        disabled={!selected || propose.isPending}
        onClick={() => {
          if (!selected) return;
          propose.mutate({
            startsAt: selected.startsAt,
            endsAt: selected.endsAt,
            note: note.trim().length > 0 ? note.trim() : undefined,
          });
        }}
      >
        {propose.isPending ? "Proposing…" : "Propose session"}
      </Button>
    </div>
  );
}
