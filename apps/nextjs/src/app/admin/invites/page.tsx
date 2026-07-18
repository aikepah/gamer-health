import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { InviteCreateForm } from "./_components/invite-create-form";
import { InvitesTable } from "./_components/invites-table";

export default function AdminInvitesPage() {
  prefetch(trpc.admin.invites.list.queryOptions({}));

  return (
    <HydrateClient>
      <main className="container max-w-3xl py-16">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">
          Coach invites
        </h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Invite a coach by email and share the generated link — there's no
          email delivery yet, so copy it from the table below.
        </p>

        <InviteCreateForm />

        <div className="mt-10">
          <InvitesTable />
        </div>
      </main>
    </HydrateClient>
  );
}
