import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { AdminUsersPageClient } from "./_components/admin-users-page-client";

const PAGE_SIZE = 50;
const AUDIT_LIMIT = 20;

export default function AdminUsersPage() {
  prefetch(trpc.admin.users.list.queryOptions({ limit: PAGE_SIZE, offset: 0 }));
  prefetch(trpc.admin.users.auditLog.queryOptions({ limit: AUDIT_LIMIT }));

  return (
    <HydrateClient>
      <main className="container max-w-5xl py-16">
        <h1 className="mb-8 text-3xl font-bold tracking-tight">
          User management
        </h1>
        <AdminUsersPageClient pageSize={PAGE_SIZE} auditLimit={AUDIT_LIMIT} />
      </main>
    </HydrateClient>
  );
}
