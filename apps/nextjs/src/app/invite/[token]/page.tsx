import { getSession } from "~/auth/server";
import { getInviteByToken } from "~/trpc/server";
import { InviteAcceptCard } from "./_components/invite-accept-card";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [session, invite] = await Promise.all([
    getSession(),
    getInviteByToken(token),
  ]);

  return (
    <main className="container flex min-h-[70vh] max-w-md flex-col justify-center py-16">
      <InviteAcceptCard
        token={token}
        invite={invite}
        sessionUser={session ? { email: session.user.email } : null}
      />
    </main>
  );
}
