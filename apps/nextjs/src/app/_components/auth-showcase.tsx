import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@gamer-health/ui/button";

import { auth, getSession } from "~/auth/server";
import { env } from "~/env";
import { EmailAuthForm } from "./email-auth-form";

export async function AuthShowcase() {
  const session = await getSession();

  if (!session) {
    const discordConfigured = Boolean(
      env.AUTH_DISCORD_ID && env.AUTH_DISCORD_SECRET,
    );
    const googleConfigured = Boolean(
      env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET,
    );

    return (
      <div className="flex w-full flex-col items-center gap-4">
        <EmailAuthForm />

        {discordConfigured && (
          <form>
            <Button
              size="lg"
              variant="outline"
              formAction={async () => {
                "use server";
                const res = await auth.api.signInSocial({
                  body: {
                    provider: "discord",
                    callbackURL: "/",
                  },
                });
                if (!res.url) {
                  throw new Error("No URL returned from signInSocial");
                }
                redirect(res.url);
              }}
            >
              Sign in with Discord
            </Button>
          </form>
        )}

        {googleConfigured && (
          <form>
            <Button
              size="lg"
              variant="outline"
              formAction={async () => {
                "use server";
                const res = await auth.api.signInSocial({
                  body: {
                    provider: "google",
                    callbackURL: "/",
                  },
                });
                if (!res.url) {
                  throw new Error("No URL returned from signInSocial");
                }
                redirect(res.url);
              }}
            >
              Sign in with Google
            </Button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <p className="text-center text-2xl">
        <span>Logged in as {session.user.name}</span>
      </p>

      <div className="flex gap-4">
        <Link
          href="/sessions"
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          Sessions
        </Link>
        <Link
          href="/habits"
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          Habits
        </Link>
        <Link
          href="/settings"
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          Settings
        </Link>
      </div>

      <form>
        <Button
          size="lg"
          formAction={async () => {
            "use server";
            await auth.api.signOut({
              headers: await headers(),
            });
            redirect("/");
          }}
        >
          Sign out
        </Button>
      </form>
    </div>
  );
}
