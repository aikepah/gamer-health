import { redirect } from "next/navigation";

import { getServerAuthz } from "~/trpc/server";

/**
 * Guards every `/coach/*` route: only an active coach may pass. No coach
 * pages exist yet in wave 1 (#4) — this gate ships ahead of them so later
 * features only need to add pages, not authorization.
 * See docs/features/roles-authorization.md.
 */
export default async function CoachLayout(props: {
  children: React.ReactNode;
}) {
  const authz = await getServerAuthz();
  if (authz?.role !== "coach") {
    redirect("/");
  }

  return <>{props.children}</>;
}
