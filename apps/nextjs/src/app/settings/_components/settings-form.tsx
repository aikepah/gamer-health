"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { z } from "zod/v4";

import type { GamingPlatform } from "@gamer-health/validators";
import { cn } from "@gamer-health/ui";
import { Button } from "@gamer-health/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@gamer-health/ui/field";
import { toast } from "@gamer-health/ui/toast";
import { GAMING_PLATFORMS } from "@gamer-health/validators";

import { useTRPC } from "~/trpc/react";

const TIME_ZONES = Intl.supportedValuesOf("timeZone");

// Mirrors UpsertProfileSchema's constraints, but with concrete (non-optional,
// non-nullable) field types matching the form's own default-values shape —
// the server-side schema stays the source of truth for persistence.
const SettingsFormSchema = z.object({
  timezone: z.string().min(1).max(64),
  platforms: z.array(z.enum(GAMING_PLATFORMS)).max(10),
  goals: z.string().max(1000),
});

function isGamingPlatform(value: string): value is GamingPlatform {
  return (GAMING_PLATFORMS as readonly string[]).includes(value);
}

export function SettingsForm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: profile } = useSuspenseQuery(trpc.profile.get.queryOptions());

  // timezone is null until the user saves a choice — prefill with the
  // browser's detected timezone in that case. A saved value (including an
  // explicit "UTC") is never second-guessed.
  const [browserTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const initialTimezone =
    profile.timezone ??
    (TIME_ZONES.includes(browserTimezone) ? browserTimezone : "UTC");

  const updateProfile = useMutation(
    trpc.profile.update.mutationOptions({
      onSuccess: (data) => {
        // The mutation returns the fresh row — write it into the cache
        // instead of paying a refetch round trip.
        queryClient.setQueryData(trpc.profile.get.queryKey(), data);
        toast.success("Settings saved");
      },
      onError: () => {
        toast.error("Failed to save settings");
      },
    }),
  );

  const form = useForm({
    defaultValues: {
      timezone: initialTimezone,
      // DB stores text[]; keep only known tags (the chips can't render others).
      platforms: profile.platforms.filter(isGamingPlatform),
      goals: profile.goals ?? "",
    },
    validators: {
      onSubmit: SettingsFormSchema,
    },
    onSubmit: (data) =>
      updateProfile.mutateAsync({
        timezone: data.value.timezone,
        platforms: data.value.platforms,
        goals: data.value.goals.length > 0 ? data.value.goals : null,
      }),
  });

  return (
    <form
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field
          name="timezone"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <FieldContent>
                  <FieldLabel htmlFor={field.name}>Timezone</FieldLabel>
                </FieldContent>
                <select
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                  className={cn(
                    "border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none md:text-sm",
                    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                  )}
                >
                  {TIME_ZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        />

        <form.Field
          name="platforms"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <FieldContent>
                  <FieldLabel>Platforms</FieldLabel>
                </FieldContent>
                <div className="flex flex-wrap gap-2">
                  {GAMING_PLATFORMS.map((platform) => {
                    const selected = field.state.value.includes(platform);
                    return (
                      <Button
                        key={platform}
                        type="button"
                        size="sm"
                        variant={selected ? "default" : "outline"}
                        aria-pressed={selected}
                        onClick={() => {
                          field.handleChange(
                            selected
                              ? field.state.value.filter((p) => p !== platform)
                              : [...field.state.value, platform],
                          );
                        }}
                      >
                        {platform}
                      </Button>
                    );
                  })}
                </div>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        />

        <form.Field
          name="goals"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <FieldContent>
                  <FieldLabel htmlFor={field.name}>Goals</FieldLabel>
                </FieldContent>
                <textarea
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                  maxLength={1000}
                  rows={4}
                  placeholder="Game hard, stay healthy."
                  className={cn(
                    "border-input placeholder:text-muted-foreground w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm",
                    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                  )}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        />
      </FieldGroup>

      <Button type="submit" className="mt-6" disabled={updateProfile.isPending}>
        {updateProfile.isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
