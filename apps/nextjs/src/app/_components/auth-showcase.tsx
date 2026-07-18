import { redirect } from "next/navigation";

import { Button } from "@gamer-health/ui/button";

import { auth, getSession } from "~/auth/server";
import { env } from "~/env";
import { EmailAuthForm } from "./email-auth-form";

export async function AuthShowcase({
  redirectTo,
}: {
  /** Internal path to return to after auth (e.g. `/invite/<token>`). */
  redirectTo?: string;
} = {}) {
  const session = await getSession();

  if (!session) {
    const discordConfigured = Boolean(
      env.AUTH_DISCORD_ID && env.AUTH_DISCORD_SECRET,
    );
    const googleConfigured = Boolean(
      env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET,
    );
    const callbackURL = redirectTo ?? "/";

    return (
      <div className="flex w-full flex-col items-center gap-4">
        <EmailAuthForm redirectTo={redirectTo} />

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
                    callbackURL,
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
                    callbackURL,
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

  // Signed in: navigation and sign-out live in the persistent AppNav header.
  return (
    <p className="text-muted-foreground text-sm">
      Welcome back, {session.user.name}
    </p>
  );
}
