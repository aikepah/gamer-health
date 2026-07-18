import { z } from "zod/v4";

import { desc } from "@gamer-health/db";
import { CoachInvite } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { requireRole } from "../authz/requireRole";
import type { CoachInviteStatus } from "./status";
import { coachInviteStatus } from "./status";

export const listCoachInvitesInput = z.object({
  status: z.enum(["pending", "accepted", "revoked", "expired"]).optional(),
});
export type ListCoachInvitesInput = z.infer<typeof listCoachInvitesInput>;

export interface ListCoachInvitesItem {
  id: string;
  email: string;
  token: string;
  status: CoachInviteStatus;
  invitedBy: { userId: string; name: string };
  expiresAt: Date;
  createdAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

/** Admin-only: newest first, with the derived status applied as a filter (if given) after computing it. */
export async function listCoachInvites(
  ctx: ServiceCtx,
  input: ListCoachInvitesInput,
): Promise<ListCoachInvitesItem[]> {
  await requireRole(ctx, ["admin"]);

  const rows = await ctx.db.query.CoachInvite.findMany({
    orderBy: desc(CoachInvite.createdAt),
    with: { invitedBy: { columns: { id: true, name: true } } },
  });

  const now = new Date();
  const items: ListCoachInvitesItem[] = rows.map((row) => ({
    id: row.id,
    email: row.email,
    token: row.token,
    status: coachInviteStatus(row, now),
    invitedBy: { userId: row.invitedBy.id, name: row.invitedBy.name },
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    acceptedAt: row.acceptedAt,
    revokedAt: row.revokedAt,
  }));

  return input.status
    ? items.filter((item) => item.status === input.status)
    : items;
}
