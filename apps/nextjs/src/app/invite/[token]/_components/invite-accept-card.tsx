"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@gamer-health/api";
import { Button } from "@gamer-health/ui/button";
import { toast } from "@gamer-health/ui/toast";

import { authClient } from "~/auth/client";
import { useTRPC } from "~/trpc/react";

type InviteByToken = RouterOutputs["invite"]["byToken"];

export function InviteAcceptCard({
  token,
  invite,
  sessionUser,
}: {
  token: string;
  invite: InviteByToken | null;
  sessionUser: { email: string } | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();

  const accept = useMutation(
    trpc.invite.accept.mutationOptions({
      onSuccess: () => {
        toast.success("You're now a coach!");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to accept invite");
      },
    }),
  );

  async function handleSignOut() {
    await authClient.signOut();
    router.refresh();
  }

  if (!invite) {
    return (
      <Card title="Invite not found">
        <p className="text-muted-foreground text-sm">
          This invite link isn't valid. Ask the admin who sent it to check
          the link, or send a new one.
        </p>
      </Card>
    );
  }

  if (invite.status === "revoked") {
    return (
      <Card title="Invite revoked">
        <p className="text-muted-foreground text-sm">
          This invite has been revoked. Ask an admin to send a new one if you
          still need coach access.
        </p>
      </Card>
    );
  }

  if (invite.status === "expired") {
    return (
      <Card title="Invite expired">
        <p className="text-muted-foreground text-sm">
          This invite expired. Ask an admin to send a new one.
        </p>
      </Card>
    );
  }

  if (invite.status === "accepted" || accept.isSuccess) {
    return (
      <Card title="Invite accepted">
        <p className="text-muted-foreground mb-4 text-sm">
          This invite has already been accepted.
        </p>
        <Button asChild>
          <Link href="/">Go to Gamer Health</Link>
        </Button>
      </Card>
    );
  }

  // Pending from here on.
  if (!sessionUser) {
    const redirectTo = encodeURIComponent(`/invite/${token}`);
    return (
      <Card title="You've been invited to coach">
        <p className="text-muted-foreground mb-4 text-sm">
          Sign in or create an account with <strong>{invite.email}</strong>{" "}
          to accept.
        </p>
        <Button asChild>
          <Link href={`/?redirect=${redirectTo}`}>Sign in / sign up</Link>
        </Button>
      </Card>
    );
  }

  if (sessionUser.email.trim().toLowerCase() !== invite.email) {
    return (
      <Card title="Wrong account">
        <p className="text-muted-foreground mb-4 text-sm">
          This invite is for <strong>{invite.email}</strong>, but you're
          signed in as {sessionUser.email}. Sign out and sign back in with
          the invited email to accept.
        </p>
        <Button type="button" variant="outline" onClick={handleSignOut}>
          Sign out
        </Button>
      </Card>
    );
  }

  return (
    <Card title="You've been invited to coach">
      <p className="text-muted-foreground mb-4 text-sm">
        Accept this invite to become a coach on Gamer Health.
      </p>
      <Button
        type="button"
        disabled={accept.isPending}
        onClick={() => accept.mutate({ token })}
      >
        {accept.isPending ? "Accepting…" : "Accept invite"}
      </Button>
    </Card>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border rounded-lg border p-6">
      <h1 className="mb-3 text-xl font-bold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}
