"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import type { CoachSpecialty } from "@gamer-health/validators";
import { Button } from "@gamer-health/ui/button";
import { Input } from "@gamer-health/ui/input";
import { Label } from "@gamer-health/ui/label";
import { toast } from "@gamer-health/ui/toast";
import { COACH_SPECIALTIES, WEEKDAY_LABELS } from "@gamer-health/validators";

import type { PickedGame } from "~/app/_components/sessions/game-picker";
import { CoachProfileCard } from "~/app/_components/coaching/coach-profile-card";
import { GamePicker } from "~/app/_components/sessions/game-picker";
import { formatMinuteOfDay, minutesFromTimeString } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

export function CoachProfileEditor() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: profile } = useSuspenseQuery(
    trpc.coaching.profile.getMine.queryOptions(),
  );

  function writeCache(next: typeof profile) {
    queryClient.setQueryData(trpc.coaching.profile.getMine.queryKey(), next);
  }

  // --- Headline / bio / specialties ---------------------------------------
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [specialties, setSpecialties] = useState<CoachSpecialty[]>(
    profile.specialties,
  );

  const updateProfile = useMutation(
    trpc.coaching.profile.update.mutationOptions({
      onSuccess: (data) => {
        writeCache(data);
        toast.success("Profile saved");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to save profile");
      },
    }),
  );

  function toggleSpecialty(specialty: CoachSpecialty) {
    setSpecialties((prev) =>
      prev.includes(specialty)
        ? prev.filter((s) => s !== specialty)
        : [...prev, specialty],
    );
  }

  // --- Games I coach --------------------------------------------------------
  const setGames = useMutation(
    trpc.coaching.profile.setGames.mutationOptions({
      onSuccess: (games) => {
        writeCache({ ...profile, games });
        toast.success("Games updated");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update games");
      },
    }),
  );

  function addGame(game: PickedGame) {
    if (profile.games.some((g) => g.id === game.id)) {
      return;
    }
    setGames.mutate({ gameIds: [...profile.games.map((g) => g.id), game.id] });
  }
  function removeGame(gameId: string) {
    setGames.mutate({
      gameIds: profile.games.filter((g) => g.id !== gameId).map((g) => g.id),
    });
  }

  // --- Weekly availability ---------------------------------------------------
  const setAvailability = useMutation(
    trpc.coaching.profile.setAvailability.mutationOptions({
      onSuccess: (availability) => {
        writeCache({ ...profile, availability });
        toast.success("Availability updated");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update availability");
      },
    }),
  );

  const [newBlockWeekday, setNewBlockWeekday] = useState(1);
  const [newBlockStart, setNewBlockStart] = useState("17:00");
  const [newBlockEnd, setNewBlockEnd] = useState("20:00");

  function blocksToInput(
    blocks: { weekday: number; startMinute: number; endMinute: number }[],
  ) {
    return blocks.map((b) => ({
      weekday: b.weekday,
      startMinute: b.startMinute,
      endMinute: b.endMinute,
    }));
  }

  function addBlock() {
    const blocks = [
      ...blocksToInput(profile.availability),
      {
        weekday: newBlockWeekday,
        startMinute: minutesFromTimeString(newBlockStart),
        endMinute: minutesFromTimeString(newBlockEnd),
      },
    ];
    setAvailability.mutate({ blocks });
  }
  function removeBlock(id: string) {
    const blocks = blocksToInput(
      profile.availability.filter((b) => b.id !== id),
    );
    setAvailability.mutate({ blocks });
  }

  // --- Publish / accepting toggles -------------------------------------------
  const setPublished = useMutation(
    trpc.coaching.profile.setPublished.mutationOptions({
      onSuccess: ({ isPublished }) => {
        writeCache({ ...profile, isPublished });
        toast.success(
          isPublished ? "Profile published" : "Profile unpublished",
        );
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update publish status");
      },
    }),
  );
  const setAccepting = useMutation(
    trpc.coaching.profile.setAccepting.mutationOptions({
      onSuccess: ({ acceptingApplications }) => {
        writeCache({ ...profile, acceptingApplications });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update");
      },
    }),
  );

  const missing: string[] = [];
  if (!profile.timezone) missing.push("Set your timezone (in Settings)");
  if (!profile.headline) missing.push("Add a headline");
  if (profile.games.length === 0)
    missing.push("Add at least one game you coach");
  if (profile.availability.length === 0)
    missing.push("Add at least one availability block");

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Profile</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="coach-headline">Headline</Label>
          <Input
            id="coach-headline"
            maxLength={120}
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
            placeholder="e.g. Sleep and focus coaching for competitive gamers"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="coach-bio">Bio</Label>
          <textarea
            id="coach-bio"
            rows={4}
            maxLength={4000}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            className="border-input placeholder:text-muted-foreground w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
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
        <div>
          <Button
            onClick={() =>
              updateProfile.mutate({
                headline: headline.trim().length > 0 ? headline.trim() : null,
                bio: bio.trim().length > 0 ? bio : null,
                specialties,
              })
            }
            disabled={updateProfile.isPending}
          >
            {updateProfile.isPending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Games I coach</h2>
        <GamePicker
          key={profile.games.map((g) => g.id).join(",")}
          value={null}
          onChange={addGame}
          placeholder="Add a game…"
        />
        <ul className="flex flex-wrap gap-2">
          {profile.games.map((g) => (
            <li
              key={g.id}
              className="bg-muted flex items-center gap-2 rounded-full py-1 pr-1 pl-3 text-sm"
            >
              {g.name}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => removeGame(g.id)}
                aria-label={`Remove ${g.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {profile.games.length === 0 && (
          <p className="text-muted-foreground text-sm">No games added yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Weekly availability</h2>
        {profile.timezone ? (
          <p className="text-muted-foreground text-sm">
            Times shown in your profile timezone:{" "}
            <span className="font-medium">{profile.timezone}</span>.
          </p>
        ) : (
          <p className="text-destructive text-sm">
            Set your timezone in Settings before adding availability — blocks
            are wall-clock times in that timezone.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {WEEKDAY_LABELS.map((label, weekday) => {
            const blocks = profile.availability.filter(
              (b) => b.weekday === weekday,
            );
            if (blocks.length === 0) return null;
            return (
              <li
                key={weekday}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="w-24 font-medium">{label}</span>
                {blocks.map((b) => (
                  <span
                    key={b.id}
                    className="bg-muted flex items-center gap-2 rounded-full py-1 pr-1 pl-3"
                  >
                    {formatMinuteOfDay(b.startMinute)}–
                    {formatMinuteOfDay(b.endMinute)}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => removeBlock(b.id)}
                      aria-label="Remove availability block"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
        {profile.availability.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No availability blocks yet.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-block-weekday">Day</Label>
            <select
              id="new-block-weekday"
              value={newBlockWeekday}
              onChange={(event) =>
                setNewBlockWeekday(Number(event.target.value))
              }
              className="border-input h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"
            >
              {WEEKDAY_LABELS.map((label, weekday) => (
                <option key={weekday} value={weekday}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-block-start">Start</Label>
            <Input
              id="new-block-start"
              type="time"
              value={newBlockStart}
              onChange={(event) => setNewBlockStart(event.target.value)}
              className="w-32"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-block-end">End</Label>
            <Input
              id="new-block-end"
              type="time"
              value={newBlockEnd}
              onChange={(event) => setNewBlockEnd(event.target.value)}
              className="w-32"
            />
          </div>
          <Button
            type="button"
            onClick={addBlock}
            disabled={setAvailability.isPending}
          >
            Add block
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Visibility</h2>
        {missing.length > 0 && (
          <div className="rounded-md border border-dashed p-3 text-sm">
            <p className="mb-1 font-medium">To publish your profile:</p>
            <ul className="text-muted-foreground list-inside list-disc">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant={profile.isPublished ? "default" : "outline"}
            onClick={() =>
              setPublished.mutate({ published: !profile.isPublished })
            }
            disabled={setPublished.isPending}
          >
            {profile.isPublished ? "Published — unpublish" : "Publish profile"}
          </Button>
          <Button
            type="button"
            variant={profile.acceptingApplications ? "default" : "outline"}
            onClick={() =>
              setAccepting.mutate({
                accepting: !profile.acceptingApplications,
              })
            }
            disabled={setAccepting.isPending}
          >
            {profile.acceptingApplications
              ? "Accepting new players"
              : "Not accepting new players"}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Preview</h2>
        <p className="text-muted-foreground text-sm">
          This is what players see on your public profile.
        </p>
        <CoachProfileCard profile={profile} />
      </section>
    </div>
  );
}
