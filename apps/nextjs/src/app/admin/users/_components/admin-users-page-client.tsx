"use client";

import { useEffect, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import type { RouterOutputs } from "@gamer-health/api";
import type { UserRole } from "@gamer-health/validators";
import { cn } from "@gamer-health/ui";
import { Button } from "@gamer-health/ui/button";
import { Input } from "@gamer-health/ui/input";
import { Label } from "@gamer-health/ui/label";
import { toast } from "@gamer-health/ui/toast";
import { USER_ROLES } from "@gamer-health/validators";

import { useTRPC } from "~/trpc/react";

type AuditEntry = RouterOutputs["admin"]["users"]["auditLog"][number];

const ROLE_LABELS: Record<UserRole, string> = {
  player: "Player",
  coach: "Coach",
  admin: "Admin",
};

const selectClassName = cn(
  "border-input h-9 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none md:text-sm",
  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
);

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function describeAuditEntry(entry: AuditEntry): string {
  switch (entry.action) {
    case "role_change": {
      const from = typeof entry.meta.from === "string" ? entry.meta.from : "?";
      const to = typeof entry.meta.to === "string" ? entry.meta.to : "?";
      return `changed role: ${from} → ${to}`;
    }
    case "user_deactivate":
      return "deactivated account";
    case "user_reactivate":
      return "reactivated account";
    default:
      return entry.action.replace(/_/g, " ");
  }
}

export function AdminUsersPageClient({
  pageSize,
  auditLimit,
}: {
  pageSize: number;
  auditLimit: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [queryInput, setQueryInput] = useState("");
  const debouncedQuery = useDebouncedValue(queryInput, 300);
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [offset, setOffset] = useState(0);

  // Reset to page 1 whenever the search/filter changes — adjusting state
  // during render (React's recommended pattern) rather than in an effect,
  // so it doesn't trigger an extra cascading render.
  const [appliedFilters, setAppliedFilters] = useState({
    query: debouncedQuery,
    role: roleFilter,
  });
  if (
    appliedFilters.query !== debouncedQuery ||
    appliedFilters.role !== roleFilter
  ) {
    setAppliedFilters({ query: debouncedQuery, role: roleFilter });
    setOffset(0);
  }

  const { data } = useSuspenseQuery(
    trpc.admin.users.list.queryOptions({
      query: debouncedQuery || undefined,
      role: roleFilter || undefined,
      limit: pageSize,
      offset,
    }),
  );
  const { data: auditLog } = useSuspenseQuery(
    trpc.admin.users.auditLog.queryOptions({ limit: auditLimit }),
  );

  function invalidateAll() {
    void queryClient.invalidateQueries({
      queryKey: trpc.admin.users.list.queryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: trpc.admin.users.auditLog.queryKey(),
    });
  }

  const setRole = useMutation(
    trpc.admin.users.setRole.mutationOptions({
      onSuccess: () => {
        toast.success("Role updated");
        invalidateAll();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update role");
      },
    }),
  );

  const setActivation = useMutation(
    trpc.admin.users.setActivation.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.deactivatedAt ? "User deactivated" : "User reactivated",
        );
        invalidateAll();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update account status");
      },
    }),
  );

  return (
    <div className="flex flex-col gap-10">
      <section>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="user-search">Search</Label>
            <Input
              id="user-search"
              placeholder="Name or email"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              className="w-64"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="role-filter">Role</Label>
            <select
              id="role-filter"
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(event.target.value as UserRole | "")
              }
              className={selectClassName}
            >
              <option value="">All roles</option>
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Role</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Joined</th>
                <th className="p-3 font-medium">Sessions</th>
                <th className="p-3 font-medium">Check-ins</th>
                <th className="p-3 font-medium">Last active</th>
                <th className="p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((row) => {
                const isActive = row.deactivatedAt == null;
                return (
                  <tr
                    key={row.userId}
                    className={cn("border-t", !isActive && "opacity-50")}
                  >
                    <td className="p-3">{row.name}</td>
                    <td className="p-3">{row.email}</td>
                    <td className="p-3">
                      <select
                        value={row.role}
                        disabled={setRole.isPending}
                        onChange={(event) => {
                          const nextRole = event.target.value as UserRole;
                          if (nextRole === row.role) return;
                          if (
                            window.confirm(
                              `Change ${row.name}'s role from ${ROLE_LABELS[row.role]} to ${ROLE_LABELS[nextRole]}?`,
                            )
                          ) {
                            setRole.mutate({
                              userId: row.userId,
                              role: nextRole,
                            });
                          }
                        }}
                        className={cn(selectClassName, "h-8")}
                      >
                        {USER_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      {isActive ? "Active" : "Deactivated"}
                    </td>
                    <td className="p-3">
                      {new Date(row.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-3">{row.sessionCount}</td>
                    <td className="p-3">{row.checkinCount}</td>
                    <td className="p-3">
                      {row.lastActiveAt
                        ? new Date(row.lastActiveAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="p-3">
                      <Button
                        size="sm"
                        variant={isActive ? "destructive" : "outline"}
                        disabled={setActivation.isPending}
                        onClick={() => {
                          const verb = isActive ? "Deactivate" : "Reactivate";
                          if (window.confirm(`${verb} ${row.name}?`)) {
                            setActivation.mutate({
                              userId: row.userId,
                              active: !isActive,
                            });
                          }
                        }}
                      >
                        {isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {data.users.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="text-muted-foreground p-6 text-center"
                  >
                    No users match this search/filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
          >
            Previous
          </Button>
          <p className="text-muted-foreground text-sm">
            {data.total === 0
              ? "0 users"
              : `${offset + 1}–${Math.min(offset + pageSize, data.total)} of ${data.total}`}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + pageSize >= data.total}
            onClick={() => setOffset(offset + pageSize)}
          >
            Next
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent admin activity</h2>
        {auditLog.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No admin activity yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {auditLog.map((entry) => (
              <li key={entry.id} className="rounded-lg border p-3 text-sm">
                <span className="font-medium">{entry.actor.name}</span>{" "}
                {describeAuditEntry(entry)}
                {entry.target && (
                  <>
                    {" "}
                    for <span className="font-medium">
                      {entry.target.name}
                    </span>
                  </>
                )}
                <span className="text-muted-foreground">
                  {" "}
                  · {new Date(entry.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
