import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@gamer-health/ui/button";
import { ThemeToggle } from "@gamer-health/ui/theme";

import { auth, getSession } from "~/auth/server";
import { getServerAuthz, getServerMyCoach } from "~/trpc/server";
import { NavLinks } from "./nav-links";

export async function AppNav() {
  const session = await getSession();
  const authz = session ? await getServerAuthz() : null;
  // #15: only fetched for players (coaches never need it, and it'd 404-ish
  // anyway since `myCoach` is the player-side query).
  const myCoach =
    session && authz?.role !== "coach" ? await getServerMyCoach() : null;

  return (
    <header className="bg-background/80 border-border sticky top-0 z-40 border-b backdrop-blur">
      <div className="container flex h-14 max-w-5xl items-center justify-between gap-4">
        <Link
          href="/"
          className="text-base font-extrabold tracking-tight whitespace-nowrap"
        >
          Gamer <span className="text-primary">Health</span>
        </Link>

        {session && (
          <NavLinks
            isAdmin={authz?.role === "admin"}
            isCoach={authz?.role === "coach"}
            hasCoach={myCoach !== null}
          />
        )}

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {session && (
            <form>
              <Button
                size="sm"
                variant="ghost"
                formAction={async () => {
                  "use server";
                  await auth.api.signOut({ headers: await headers() });
                  redirect("/");
                }}
              >
                Sign out
              </Button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
