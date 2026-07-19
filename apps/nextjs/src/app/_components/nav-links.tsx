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
 */
const COACH_LINKS = [{ href: "/coach/profile", label: "Coach" }] as const;

export function NavLinks({
  isAdmin,
  isCoach,
}: {
  isAdmin: boolean;
  isCoach: boolean;
}) {
  const pathname = usePathname();
  const links = [
    ...LINKS,
    ...(isCoach ? COACH_LINKS : []),
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
