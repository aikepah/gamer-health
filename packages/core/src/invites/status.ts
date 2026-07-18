/**
 * Coach invite status is DERIVED, never stored (docs/features/admin-invitations.md).
 * Ordering: revoked (revokedAt set) > accepted (acceptedAt set) > expired
 * (expiresAt < now) > pending. This is the only place the ordering lives.
 */
export type CoachInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export function coachInviteStatus(
  invite: { revokedAt: Date | null; acceptedAt: Date | null; expiresAt: Date },
  now: Date = new Date(),
): CoachInviteStatus {
  if (invite.revokedAt) {
    return "revoked";
  }
  if (invite.acceptedAt) {
    return "accepted";
  }
  if (invite.expiresAt < now) {
    return "expired";
  }
  return "pending";
}
