import type { RouterOutputs } from "@gamer-health/api";
import { WEEKDAY_LABELS } from "@gamer-health/validators";

import { formatMinuteOfDay } from "~/lib/format";

export type CoachProfileCardData =
  RouterOutputs["coaching"]["profile"]["getMine"];

/**
 * Public-facing coach profile card: name, headline, specialties, games,
 * availability summary. Used on the coach's own `/coach/profile` editor as a
 * live preview, and reused verbatim by #10's coach detail page.
 */
export function CoachProfileCard({
  profile,
}: {
  profile: CoachProfileCardData;
}) {
  const availabilityByWeekday = new Map<
    number,
    CoachProfileCardData["availability"]
  >();
  for (const block of profile.availability) {
    const existing = availabilityByWeekday.get(block.weekday) ?? [];
    existing.push(block);
    availabilityByWeekday.set(block.weekday, existing);
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-5">
      <div>
        <h3 className="text-lg font-semibold">{profile.name}</h3>
        {profile.headline && (
          <p className="text-muted-foreground text-sm">{profile.headline}</p>
        )}
      </div>

      {profile.bio && <p className="text-sm">{profile.bio}</p>}

      {profile.specialties.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {profile.specialties.map((specialty) => (
            <span
              key={specialty}
              className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 text-xs font-medium"
            >
              {specialty}
            </span>
          ))}
        </div>
      )}

      {profile.games.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide uppercase">
            Games
          </p>
          <p className="text-muted-foreground text-sm">
            {profile.games.map((g) => g.name).join(", ")}
          </p>
        </div>
      )}

      {profile.availability.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide uppercase">
            Availability{profile.timezone ? ` (${profile.timezone})` : ""}
          </p>
          <ul className="text-muted-foreground text-sm">
            {WEEKDAY_LABELS.map((label, weekday) => {
              const blocks = availabilityByWeekday.get(weekday);
              if (!blocks || blocks.length === 0) return null;
              return (
                <li key={weekday}>
                  {label}:{" "}
                  {blocks
                    .map(
                      (b) =>
                        `${formatMinuteOfDay(b.startMinute)}–${formatMinuteOfDay(b.endMinute)}`,
                    )
                    .join(", ")}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex gap-2 text-xs">
        <span
          className={
            profile.isPublished
              ? "text-green-600 dark:text-green-400"
              : "text-muted-foreground"
          }
        >
          {profile.isPublished ? "Published" : "Not published"}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {profile.acceptingApplications
            ? "Accepting new players"
            : "Not accepting new players"}
        </span>
      </div>
    </div>
  );
}
