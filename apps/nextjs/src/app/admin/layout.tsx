import { redirect } from "next/navigation";

import { getServerAuthz } from "~/trpc/server";

/**
 * Guards every `/admin/*` route: only an active admin may pass. Anyone else
 * (unauthenticated, wrong role, or deactivated) is redirected home.
 * See docs/features/roles-authorization.md.
 */
export default async function AdminLayout(props: {
  children: React.ReactNode;
}) {
  const authz = await getServerAuthz();
  if (authz?.role !== "admin") {
    redirect("/");
  }

  return <>{props.children}</>;
}
