"use client";

import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@gamer-health/api";
import { cn } from "@gamer-health/ui";
import { Button } from "@gamer-health/ui/button";
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";

type InviteItem = RouterOutputs["admin"]["invites"]["list"][number];

const STATUS_STYLES: Record<InviteItem["status"], string> = {
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  accepted: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  revoked: "bg-muted text-muted-foreground",
  expired: "bg-destructive/15 text-destructive",
};

function StatusBadge({ status }: { status: InviteItem["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function InvitesTable() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: invites } = useSuspenseQuery(
    trpc.admin.invites.list.queryOptions({}),
  );

  const revoke = useMutation(
    trpc.admin.invites.revoke.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.admin.invites.list.queryKey(),
        });
        toast.success("Invite revoked");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to revoke invite");
      },
    }),
  );

  async function copyLink(token: string) {
    const url = new URL(`/invite/${token}`, window.location.origin);
    await navigator.clipboard.writeText(url.toString());
    toast.success("Invite link copied");
  }

  if (invites.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No invites yet.</p>
    );
  }

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border text-muted-foreground border-b text-left">
            <th className="px-4 py-2 font-medium">Email</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Invited by</th>
            <th className="px-4 py-2 font-medium">Created</th>
            <th className="px-4 py-2 font-medium">Expires</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {invites.map((invite) => (
            <tr key={invite.id} className="border-border border-b last:border-0">
              <td className="px-4 py-2">{invite.email}</td>
              <td className="px-4 py-2">
                <StatusBadge status={invite.status} />
              </td>
              <td className="px-4 py-2">{invite.invitedBy.name}</td>
              <td className="px-4 py-2">{formatDate(invite.createdAt)}</td>
              <td className="px-4 py-2">{formatDate(invite.expiresAt)}</td>
              <td className="px-4 py-2">
                {invite.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void copyLink(invite.token)}
                    >
                      Copy link
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={
                        revoke.isPending &&
                        revoke.variables.inviteId === invite.id
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            `Revoke the invite for ${invite.email}?`,
                          )
                        ) {
                          revoke.mutate({ inviteId: invite.id });
                        }
                      }}
                    >
                      Revoke
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
