"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@gamer-health/ui";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/sessions", label: "Sessions" },
  { href: "/habits", label: "Habits" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
] as const;

const ADMIN_LINK = { href: "/admin", label: "Admin" } as const;

/**
 * Rendered only for coaches (#9). #10–#15 append their own entries here
 * (e.g. "Players", "Sessions") as those routes land.
 *
 * NOTE (#15 deviation): the spec calls this entry "Sessions", but `/sessions`
 * (gaming-session tracking) already owns that label in `LINKS` above, which
 * is always rendered alongside this list — a second "Sessions" link in the
 * same bar would be genuinely ambiguous. Labeled "Coaching" instead, at
 * `/coach/sessions`; see the player-side note below too.
 */
const COACH_LINKS = [
  { href: "/coach/profile", label: "Coach" },
  { href: "/coach/roster", label: "Roster" },
  { href: "/coach/sessions", label: "Coaching" },
] as const;

/** Discovery (#10): browsing/applying to coaches is a player-facing concern. */
const PLAYER_LINKS = [{ href: "/coaches", label: "Find a coach" }] as const;

/**
 * #15's player-facing session list, shown only once the player has an
 * active coach. Routed at `/coaching/sessions` rather than the spec's
 * literal `/sessions` — that path is already `apps/nextjs/src/app/sessions`
 * (gaming-session tracking, phase 2); reusing it would collide with a
 * shipped feature rather than extend it. See the PR note for details.
 */
const PLAYER_COACHING_SESSIONS_LINK = {
  href: "/coaching/sessions",
  label: "Coaching",
} as const;

export function NavLinks({
  isAdmin,
  isCoach,
  hasCoach,
}: {
  isAdmin: boolean;
  isCoach: boolean;
  /** #15: only a player with an active coach can reach the scheduler. */
  hasCoach: boolean;
}) {
  const pathname = usePathname();
  const links = [
    ...LINKS,
    ...(isCoach
      ? COACH_LINKS
      : [
          ...PLAYER_LINKS,
          ...(hasCoach ? [PLAYER_COACHING_SESSIONS_LINK] : []),
        ]),
    ...(isAdmin ? [ADMIN_LINK] : []),
  ];

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {links.map(({ href, label }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
