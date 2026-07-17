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

/** Rendered only for admins — coach nav has no pages yet in wave 1 (#4). */
const ADMIN_LINK = { href: "/admin", label: "Admin" } as const;

export function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...LINKS, ADMIN_LINK] : LINKS;

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
