"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@gamer-health/ui/button";
import { Input } from "@gamer-health/ui/input";
import { Label } from "@gamer-health/ui/label";
import { toast } from "@gamer-health/ui/toast";

import { useTRPC } from "~/trpc/react";

export function InviteCreateForm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(14);

  const create = useMutation(
    trpc.admin.invites.create.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.admin.invites.list.queryKey(),
        });
        toast.success(`Invite sent to ${email}`);
        setEmail("");
        setExpiresInDays(14);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create invite");
      },
    }),
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate({ email, expiresInDays });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border flex flex-wrap items-end gap-4 rounded-lg border p-4"
    >
      <div className="flex min-w-56 flex-1 flex-col gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="coach@example.com"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-expires">Expires in (days)</Label>
        <Input
          id="invite-expires"
          type="number"
          min={1}
          max={90}
          value={expiresInDays}
          onChange={(e) => setExpiresInDays(Number(e.target.value))}
          className="w-28"
        />
      </div>
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? "Creating…" : "Create invite"}
      </Button>
    </form>
  );
}
