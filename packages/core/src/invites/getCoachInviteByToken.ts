import { z } from "zod/v4";

import { eq } from "@gamer-health/db";
import { CoachInvite } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { CoreError } from "../lib/errors";
import type { CoachInviteStatus } from "./status";
import { coachInviteStatus } from "./status";

export const getCoachInviteByTokenInput = z.object({
  token: z.string().min(1).max(64),
});
export type GetCoachInviteByTokenInput = z.infer<
  typeof getCoachInviteByTokenInput
>;

export interface CoachInviteByToken {
  email: string;
  status: CoachInviteStatus;
  expiresAt: Date;
}

/**
 * PUBLIC — the token itself is the credential. Returns only what the
 * `/invite/[token]` page needs to render its states; `NOT_FOUND` on an
 * unknown token.
 */
export async function getCoachInviteByToken(
  ctx: ServiceCtx,
  input: GetCoachInviteByTokenInput,
): Promise<CoachInviteByToken> {
  const invite = await ctx.db.query.CoachInvite.findFirst({
    where: eq(CoachInvite.token, input.token),
  });
  if (!invite) {
    throw new CoreError("NOT_FOUND", "Invite not found");
  }

  return {
    email: invite.email,
    status: coachInviteStatus(invite),
    expiresAt: invite.expiresAt,
  };
}
