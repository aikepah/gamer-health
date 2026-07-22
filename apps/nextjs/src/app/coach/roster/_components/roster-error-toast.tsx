"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { toast } from "@gamer-health/ui/toast";

const ERROR_MESSAGES: Record<string, string> = {
  "not-your-player": "That player isn't on your roster.",
};

/**
 * Shows a toast for `?error=` redirects landing on the roster page — e.g.
 * `/coach/players/[playerUserId]` (#12) bouncing a coach back here after a
 * FORBIDDEN/NOT_FOUND on a non-roster or ended-relationship player. Strips
 * the query param afterward so a refresh doesn't re-toast.
 */
export function RosterErrorToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get("error");

  useEffect(() => {
    if (!error) return;
    toast.error(ERROR_MESSAGES[error] ?? "You don't have access to that player.");
    router.replace("/coach/roster");
  }, [error, router]);

  return null;
}
