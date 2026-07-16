"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@gamer-health/ui/button";

import { useTRPC } from "~/trpc/react";
import { CheckinDialog } from "./checkin-dialog";

/**
 * Home page card offering a `daily` check-in. Hides itself once
 * `checkin.todayStatus.hasDaily` is true (including immediately after the
 * dialog's mutation succeeds, via query invalidation).
 */
export function DailyCheckinCard() {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const { data } = useQuery(trpc.checkin.todayStatus.queryOptions());

  if (!data || data.hasDaily) {
    return null;
  }

  return (
    <div className="border-border w-full max-w-md rounded-lg border p-4">
      <p className="font-medium">Daily check-in</p>
      <p className="text-muted-foreground text-sm">
        How are you feeling today? Takes about 10 seconds.
      </p>
      <Button className="mt-3" size="sm" onClick={() => setOpen(true)}>
        Check in
      </Button>
      <CheckinDialog context="daily" open={open} onOpenChange={setOpen} />
    </div>
  );
}
